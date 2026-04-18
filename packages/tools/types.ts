export interface ToolSchema {
  name: string;
  description: string;
  args: Record<string, { type: string; description: string; required?: boolean }>;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: ToolSchema;
  abstract execute(args: Record<string, unknown>): Promise<string>;
}
