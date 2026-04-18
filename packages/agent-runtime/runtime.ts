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

On every turn, respond ONLY with valid JSON matching this schema:
{"thought": "<your reasoning>", "tool": "<tool_name>", "args": {<tool arguments>}}

When the task is complete, use the "finish" tool:
{"thought": "<final reasoning>", "tool": "finish", "args": {"answer": "<comprehensive final answer>"}}

Rules:
- ONLY respond with JSON — no prose, no markdown, no explanation outside the JSON
- Always include "thought" to explain your reasoning
- Use finish ONLY when you have confirmed data — do NOT finish with assumptions or "not found" after a single failed lookup
- If a tool returns no match, try alternative symbols/actions before concluding something doesn't exist
- The finish answer field supports markdown — use headers, lists, tables as appropriate

CoinDCX tool routing (STRICT):
- For price/market data queries (price, ticker, orderbook, candles, trade history): ALWAYS use the "coindcx" tool (public, no auth needed)
- For trading actions (orders, positions, leverage, margin): use "coindcx_futures" tool (requires API keys)
- NEVER call coindcx_futures for a price or market data query — it will always fail without API keys
- Discovery order for crypto prices: (1) coindcx(action=spot_ticker, symbol=BTCUSDT) → (2) if not found, coindcx(action=markets, symbol=BTC) to find exact pair name → (3) retry spot_ticker with correct pair → (4) try coindcx(action=futures_prices) for perpetual futures price
- BTC pairs on CoinDCX: spot uses BTCUSDT or BTCINR; futures uses B-BTC_USDT format`;
}

function parseToolCall(content: string): ToolCall | null {
  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (typeof parsed.tool !== 'string') return null;
    return { thought: parsed.thought ?? '', tool: parsed.tool, args: parsed.args ?? {} };
  } catch {
    return null;
  }
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
