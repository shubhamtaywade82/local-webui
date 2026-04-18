import { OllamaClient } from '@workspace/ollama-client';
import { ToolRegistry } from '@workspace/tools';
import { AgentConfig, EventEmitter, StepApprovalFn } from './types';
import { humanizeToolDone, humanizeToolRunning } from './humanizeAgentActivity';

interface ToolCall {
  thought: string;
  tool: string;
  args: Record<string, unknown>;
}

function buildSystemPrompt(schemas: ReturnType<ToolRegistry['schemas']>): string {
  const toolList = schemas.map(s => {
    const argStr = Object.entries(s.args)
      .map(([k, v]) => `  "${k}": ${v.type}${v.required ? ' (required)' : ''} — ${v.description}`)
      .join('\n');
    return `- ${s.name}: ${s.description}\n  args:\n${argStr || '  (none)'}`;
  }).join('\n\n');

  return `You are an AI agent that completes tasks using tools.

Available tools:
${toolList}

On every turn, respond ONLY with valid JSON. 
STRICT FORMAT:
{"thought": "<your reasoning>", "tool": "<tool_name>", "args": {<tool arguments>}}

When the task is complete, use the "finish" tool:
{"thought": "<final reasoning>", "tool": "finish", "args": {"answer": "<comprehensive final answer>"}}

RULES (STRICT):
1. Respond WITH ONLY JSON. DO NOT include markdown code blocks (\`\`\`json).
2. DO NOT include any conversational prose before or after the JSON.
3. Use finish ONLY when the task is concluded.
4. All text in the finish "answer" field should be formatted as clean Markdown.
5. **Minimize tool calls**: pick the **one** tool that answers the question; avoid calling the same tool twice with the same intent unless the first result was an error you can fix.
6. **Never call coindcx_futures** for price, ticker, chart, candle, trend, analysis, "what is X trading at", or intraday direction — those are **public market data**. Use **coindcx** (futures_prices, candles, orderbook, …) and/or **smc_analysis** only.
7. **coindcx_futures** is only for **authenticated trading**: create/cancel/edit **the user's** orders, list **their** orders, **their** positions, margin, leverage. If the user did not ask to trade or manage **their** account, do not use coindcx_futures.
8. Prefer **smc_analysis** (structure/setup/signals) OR **coindcx** candles once for TA-style questions; do not chain redundant coindcx reads.

SMC analysis tool routing:
- For trend, structure, order blocks, FVGs, liquidity, trade setups: use "smc_analysis" tool
- smc_analysis fetches its own candles from CoinDCX futures (B-XXX_USDT format); just pass symbol=BTC etc.

CoinDCX tool routing:
- For **any** public price/market/candle/trend question: use **"coindcx"** only (never coindcx_futures).
- For **authenticated** trade/account actions only: use **"coindcx_futures"** (requires API keys in the server environment).
- Spot pairs use market names like BTCUSDT; CoinDCX USDT-margined **perpetual futures** use **B-BTC_USDT**, **B-ETH_USDT** (not "ETHUSDT" alone on the candles API).
- If the user says "ETHUSDT futures", call coindcx with symbol **B-ETH_USDT** (action=futures_prices or candles). For SMC use symbol **ETH** or **B-ETH_USDT** per smc_analysis tool.`;
}

function preprocessContent(content: string): string {
  // Strip common thinking/reasoning tags that might contain conflicting braces
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();
}

function parseToolCall(content: string): ToolCall | null {
  const cleanedContent = preprocessContent(content);
  
  // 1. Try greedy extraction of everything that looks like a JSON block
  const blocks = cleanedContent.match(/\{[\s\S]*\}/g) || [];
  
  for (const block of blocks) {
    try {
      // Clean common terminal model errors (trailing commas, weird escapes)
      const cleaned = block
        .replace(/,\s*(\}|\])/g, '$1') // remove trailing commas
        .replace(/\\n/g, '\n')         // normalize newlines
        .trim();

      const parsed = JSON.parse(cleaned);
      if (typeof parsed.tool === 'string') {
        return { 
          thought: parsed.thought ?? '', 
          tool: parsed.tool, 
          args: parsed.args ?? {} 
        };
      }
    } catch {
      // Continue to next block if this one was invalid
    }
  }

  // 2. Fallback: try to find any substring that starts with {"thought" or {"tool"
  const fragments = cleanedContent.split(/(\{"thought"|\{"tool")/);
  if (fragments.length > 1) {
    for (let i = 1; i < fragments.length; i += 2) {
      const frag = fragments[i] + fragments[i+1];
      try {
        // Attempt to find the matching closing brace
        let braceCount = 0;
        let endIdx = -1;
        for (let j = 0; j < frag.length; j++) {
          if (frag[j] === '{') braceCount++;
          if (frag[j] === '}') braceCount--;
          if (braceCount === 0) {
            endIdx = j;
            break;
          }
        }
        if (endIdx !== -1) {
          const block = frag.slice(0, endIdx + 1);
          const parsed = JSON.parse(block.replace(/,\s*(\}|\])/g, '$1'));
          if (typeof parsed.tool === 'string') {
            return { thought: parsed.thought ?? '', tool: parsed.tool, args: parsed.args ?? {} };
          }
        }
      } catch {}
    }
  }

  return null;
}

export class AgentRuntime {
  constructor(
    private llm: OllamaClient,
    private tools: ToolRegistry,
    private config: AgentConfig
  ) {}

  async run(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    emit: EventEmitter,
    onApproval?: StepApprovalFn
  ): Promise<void> {
    const systemPrompt = buildSystemPrompt(this.tools.schemas());
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      let response: { message?: { content: string } };
      try {
        response = await this.llm.chat(this.config.model, messages);
      } catch (e) {
        emit({ type: 'error', payload: { error: `LLM call failed: ${(e as Error).message}`, iteration } });
        return;
      }

      const content = response.message?.content ?? '';
      const toolCall = parseToolCall(content);

      if (!toolCall) {
        console.error(`[AgentRuntime] Failed to parse model response. Raw content:\n${content}`);
        emit({
          type: 'agent_step',
          payload: {
            id: `step-${iteration}`,
            label: 'Could not parse the model plan; falling back to a streamed reply.',
            status: 'error',
            iteration
          }
        });
        await this.streamFinish(messages, emit);
        return;
      }

      if (toolCall.tool === 'finish') {
        emit({
          type: 'agent_step',
          payload: {
            id: `step-${iteration}`,
            label: humanizeToolRunning('finish', toolCall.args),
            tool: 'finish',
            status: 'success',
            iteration
          }
        });
        const answer = String(toolCall.args.answer ?? '');
        // Emit in ~80-char chunks to preserve whitespace/newlines (word-split mangled markdown)
        const chunkSize = 80;
        for (let i = 0; i < answer.length; i += chunkSize) {
          emit({ type: 'token', payload: { token: answer.slice(i, i + chunkSize) } });
        }
        emit({ type: 'done', payload: { iteration } });
        return;
      }

      if (this.config.mode === 'step' && onApproval) {
        emit({ type: 'agent_step_pending', payload: { stepId: `step-${iteration}`, toolName: toolCall.tool, toolInput: toolCall.args } });
        const approved = await onApproval(`step-${iteration}`, toolCall.tool, toolCall.args);
        if (!approved) {
          emit({
            type: 'agent_step',
            payload: {
              id: `step-${iteration}`,
              label: 'This step was skipped because you rejected it.',
              status: 'error',
              iteration
            }
          });
          emit({ type: 'done', payload: { iteration, aborted: true } });
          return;
        }
      }

      emit({
        type: 'agent_step',
        payload: {
          id: `step-${iteration}`,
          label: humanizeToolRunning(toolCall.tool, toolCall.args),
          tool: toolCall.tool,
          status: 'running',
          iteration,
          args: toolCall.args,
          thought: toolCall.thought || undefined,
        }
      });

      let toolResult: string;
      const toolStart = Date.now();
      try {
        if (!this.tools.has(toolCall.tool)) {
          toolResult = `Error: Tool "${toolCall.tool}" not found.`;
        } else {
          toolResult = await this.tools.execute(toolCall.tool, toolCall.args);
        }
      } catch (e) {
        toolResult = `Tool error: ${(e as Error).message}`;
      }

      const duration = Date.now() - toolStart;
      emit({ type: 'tool_call', payload: { tool: toolCall.tool, args: toolCall.args, result: toolResult, duration } });
      emit({
        type: 'agent_step',
        payload: {
          id: `step-${iteration}`,
          label: humanizeToolDone(toolCall.tool, toolCall.args),
          tool: toolCall.tool,
          status: 'success',
          duration,
          iteration,
          args: toolCall.args,
          result: toolResult.length > 600 ? toolResult.slice(0, 600) + '…' : toolResult,
          thought: toolCall.thought || undefined,
        }
      });

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `Tool result for ${toolCall.tool}:\n${toolResult}` });
    }

    emit({
      type: 'agent_step',
      payload: {
        id: 'max-iter',
        label: `Stopped after ${this.config.maxIterations} tool rounds to avoid a runaway loop.`,
        status: 'error'
      }
    });
    emit({ type: 'done', payload: { iteration, maxIterationsReached: true } });
  }

  private async streamFinish(
    messages: Array<{ role: string; content: string }>,
    emit: EventEmitter
  ): Promise<void> {
    try {
      await this.llm.stream(this.config.model, messages, (token) => {
        emit({ type: 'token', payload: { token } });
      });
    } catch (e) {
      emit({ type: 'error', payload: { error: `Stream error: ${(e as Error).message}` } });
    }
    emit({ type: 'done', payload: {} });
  }
}
