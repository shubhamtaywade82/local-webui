import { createOllamaClient, OllamaProvider } from "@workspace/ollama-client";

export async function summarizeConversation(
  history: string,
  model: string,
  provider: OllamaProvider
) {
  const prompt = `
Summarize the following conversation concisely, preserving key facts.

${history}

Summary:
`;

  try {
    const ollama = createOllamaClient(provider);
    const res = await ollama.chat(model, [
      { role: "user", content: prompt }
    ]);
    return res.message?.content || "";
  } catch (err) {
    console.error("Summarization error:", err);
    return "";
  }
}
