import { Chunk } from "./chunker";

export function buildContext(chunks: Chunk[]): string {
  if (chunks.length === 0) return "No relevant information found in the knowledge base.";

  return chunks.map(chunk => {
    return `### SOURCE: ${chunk.file}${chunk.header ? ` (Section: ${chunk.header})` : ""}

${chunk.content}
`;
  }).join("\n---\n\n");
}

export function wrapPrompt(query: string, context: string): string {
  return `You are a strict knowledge assistant. Use ONLY the provided knowledge to answer the question. If the answer is not present in the knowledge provided, reply exactly with "Information not found in knowledge base."

---
KNOWLEDGE BASE CONTEXT:

${context}

---
USER QUESTION:
${query}
`;
}
