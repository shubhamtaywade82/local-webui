import { describe, it, expect } from 'vitest';
import { AgentRuntime } from '../index';
import { ToolRegistry, BaseTool, ToolSchema } from '@workspace/tools';
import { AgentConfig, EventEmitter } from '../types';

class MockTool extends BaseTool {
  executionCount = 0;
  readonly name = 'mock_tool';
  readonly description = 'Mock tool for testing';
  readonly schema: ToolSchema = {
    name: 'mock_tool',
    description: 'Mock',
    args: { input: { type: 'string', description: 'input', required: true } }
  };
  async execute(args: Record<string, unknown>): Promise<string> {
    this.executionCount++;
    return `mock result: ${args.input}`;
  }
}

function mockOllama(responses: Array<{ tool: string; args: Record<string, unknown>; thought: string }>) {
  let callCount = 0;
  return {
    chat: async (_model: string, _messages: unknown[]) => {
      const r = responses[callCount++] ?? { tool: 'finish', args: { answer: 'done' }, thought: 'done' };
      return { message: { content: JSON.stringify(r) } };
    },
    stream: async (_model: string, _messages: unknown[], onToken: (t: string) => void) => {
      onToken('streamed answer');
    }
  };
}

describe('AgentRuntime', () => {
  it('calls finish tool and emits done event', async () => {
    const registry = new ToolRegistry();
    const ollama = mockOllama([{ tool: 'finish', args: { answer: 'The answer is 42' }, thought: 'I know the answer' }]);
    const config: AgentConfig = { model: 'test', maxIterations: 5, mode: 'auto' };
    const runtime = new AgentRuntime(ollama as any, registry, config);

    const events: string[] = [];
    const emit: EventEmitter = (e) => events.push(e.type);

    await runtime.run('What is 6*7?', [], emit);
    expect(events).toContain('done');
  });

  it('executes a tool and loops', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockTool());
    const ollama = mockOllama([
      { tool: 'mock_tool', args: { input: 'test' }, thought: 'need mock' },
      { tool: 'finish', args: { answer: 'mock result: test' }, thought: 'done' }
    ]);
    const config: AgentConfig = { model: 'test', maxIterations: 5, mode: 'auto' };
    const runtime = new AgentRuntime(ollama as any, registry, config);

    const steps: string[] = [];
    const emit: EventEmitter = (e) => {
      if (e.type === 'agent_step') steps.push(((e.payload as any).tool as string) ?? 'done');
    };

    await runtime.run('Use mock tool', [], emit);
    expect(steps).toContain('mock_tool');
  });

  it('does not execute the same tool twice in a row with identical args', async () => {
    const registry = new ToolRegistry();
    const mock = new MockTool();
    registry.register(mock);
    const ollama = mockOllama([
      { tool: 'mock_tool', args: { input: 'same' }, thought: 'first' },
      { tool: 'mock_tool', args: { input: 'same' }, thought: 'duplicate' },
      { tool: 'finish', args: { answer: 'done' }, thought: 'finish' }
    ]);
    const config: AgentConfig = { model: 'test', maxIterations: 10, mode: 'auto' };
    const runtime = new AgentRuntime(ollama as any, registry, config);

    await runtime.run('test', [], () => {});

    expect(mock.executionCount).toBe(1);
  });

  it('stops at maxIterations', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockTool());
    const infiniteOllama = {
      chat: async () => ({ message: { content: JSON.stringify({ tool: 'mock_tool', args: { input: 'x' }, thought: 'loop' }) } }),
      stream: async (_: unknown, __: unknown, onToken: (t: string) => void) => { onToken('stopped'); }
    };
    const config: AgentConfig = { model: 'test', maxIterations: 3, mode: 'auto' };
    const runtime = new AgentRuntime(infiniteOllama as any, registry, config);

    const events: Array<{ type: string; payload: unknown }> = [];
    await runtime.run('Loop forever', [], (e) => events.push(e));
    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });
});
