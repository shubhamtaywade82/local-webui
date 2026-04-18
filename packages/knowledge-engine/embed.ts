const EMBED_TIMEOUT_MS = Number(process.env.KNOWLEDGE_EMBED_TIMEOUT_MS) || 15_000;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text", // Standard embedding model
        prompt: text,
      }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null; // Graceful failure for fallback
    }

    const data: any = await response.json();
    return data.embedding || null;
  } catch (error) {
    // If Ollama is down or model missing, return null to trigger keyword fallback
    return null;
  }
}

/**
 * Calculates cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }

  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);

  if (mA === 0 || mB === 0) return 0;
  return dotProduct / (mA * mB);
}
