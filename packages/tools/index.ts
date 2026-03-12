export class ToolRegistry {
  tools: Record<string, any> = {};

  register(tool: any) {
    this.tools[tool.name] = tool;
  }

  async execute(name: string, args: any) {
    if (!this.tools[name]) {
      throw new Error(`Tool ${name} not found`);
    }
    return this.tools[name].run(args);
  }
}