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
3. **SYMBOL VERIFICATION PROTOCOL (DETERMINISTIC)**:
   - If a tool returns a "Symbol not found" or "No match" error: **DO NOT GUESS**.
   - Your NEXT step MUST be: call **coindcx** with action="futures_instruments" (for futures) or action="markets" (for spot) to find the correct canonical name.
   - Once found, use the exact canonical name in your next tool call.
4. **NO PSEUDO-CODE**: Never output Ruby, XML, or any scripting content. Respond ONLY with valid JSON.
5. **Minimize tool calls**: pick the **one** tool that answers the question; avoid calling the same tool twice with the same intent unless the first result was an error you can fix.
6. **Public market data**: Never use coindcx_futures for price/trend/candles. Use coindcx or smc_analysis.
7. **Spot vs Futures**: Futures OHLCV/SMC always use **B-BASE_USDT** or **B-BASE_INR**.
8. **Check then Act**: If unsure of symbol mapping, verify first via futures_instruments or markets.`;
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
      let toolCall = parseToolCall(content);

      // Self-Correction Loop: retry once on parse failure
      if (!toolCall && iteration < this.config.maxIterations) {
        emit({
          type: 'agent_step',
          payload: {
            id: `step-${iteration}-retry`,
            label: 'The model output was unparseable. Retrying with deterministic correction...',
            status: 'running',
            iteration
          }
        });

        messages.push({ role: 'assistant', content });
        messages.push({ 
          role: 'user', 
          content: 'Error: Invalid response format. You must respond with ONLY valid JSON. Avoid XML, pseudo-code, or conversational text. Use the schema: {"thought": "...", "tool": "...", "args": {...}}' 
        });

        try {
          const retryResponse = await this.llm.chat(this.config.model, messages);
          const retryContent = retryResponse.message?.content ?? '';
          toolCall = parseToolCall(retryContent);
        } catch (e) {
          console.error(`[AgentRuntime] Retry failed: ${(e as Error).message}`);
        }
      }

      if (!toolCall) {
        emit({
          type: 'agent_step',
          payload: {
            id: `step-${iteration}`,
            label: 'Model failed to follow JSON formatting after retries. Falling back to chat.',
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
              label: 'Step rejected by user.',
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
          result: toolResult.length > 800 ? toolResult.slice(0, 800) + '…' : toolResult,
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
        label: `Max iterations (${this.config.maxIterations}) reached.`,
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
