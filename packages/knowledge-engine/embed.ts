export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch("http://localhost:12434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text", // Standard embedding model
        prompt: text,
      }),
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
