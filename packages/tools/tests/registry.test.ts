import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../index';
import { BaseTool, ToolSchema } from '../types';

class EchoTool extends BaseTool {
  readonly name = 'echo';
  readonly description = 'Echoes input';
  readonly schema: ToolSchema = {
    name: 'echo',
    description: 'Echoes input',
    args: { message: { type: 'string', description: 'text to echo', required: true } }
  };
  async execute(args: Record<string, unknown>): Promise<string> {
    return String(args.message);
  }
}

describe('ToolRegistry', () => {
  it('registers and executes a tool', async () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    const result = await registry.execute('echo', { message: 'hello' });
    expect(result).toBe('hello');
  });

  it('throws on unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('missing', {})).rejects.toThrow('Tool "missing" not found');
  });

  it('returns schemas array', () => {
    const registry = new ToolRegistry();
    registry.register(new EchoTool());
    const schemas = registry.schemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('echo');
  });
});
