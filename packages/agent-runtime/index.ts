export class AgentRuntime {
  constructor(private llm: any, private tools: any) {}

  async run(prompt: string, context?: string) {
    const plan = await this.llm.chat("llama3:8b", [
      { role: "system", content: "Decide best tool" },
      { role: "user", content: prompt }
    ]);

    const tool = this.extractTool(plan.message?.content || "");
    if (!tool) return plan.message?.content || "";

    const result = await this.tools.execute(tool, {});
    return result;
  }

  extractTool(text: string) {
    const match = text.match(/tool:(\w+)/);
    return match?.[1];
  }
}