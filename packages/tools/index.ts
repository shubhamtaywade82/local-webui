import { BaseTool, ToolSchema } from './types';

export { BaseTool } from './types';
export type { ToolSchema } from './types';
export * from './file-tools';
export * from './db-tools';
export * from './kb-tools';
export * from './code-tools';
export * from './web-tools';
export * from './coindcx-tool';
export * from './coindcx-futures-tool';
export * from './coindcx-public';
export * from './smc-analysis-tool';
export * from './smc-engine';
export * from './smc-automation-decision';
export * from './telegram-tool';
export * from './telegram-send';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool.execute(args);
  }

  schemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
