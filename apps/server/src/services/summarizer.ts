import { OllamaClient } from "@workspace/ollama-client";

const ollama = new OllamaClient();

export async function summarizeConversation(history: string) {
  const prompt = `
Summarize the following conversation concisely, preserving key facts.

${history}

Summary:
`;

  try {
    const res = await ollama.chat("qwen2.5:0.5b", [
      { role: "user", content: prompt }
    ]);
    return res.message?.content || "";
  } catch (err) {
    console.error("Summarization error:", err);
    return "";
  }
}