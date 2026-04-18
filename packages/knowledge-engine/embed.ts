const EMBED_TIMEOUT_MS = Number(process.env.KNOWLEDGE_EMBED_TIMEOUT_MS) || 15_000;
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || (process.env.OLLAMA_API_KEY ? "embeddinggemma" : "nomic-embed-text");

function getOllamaBase(): string {
  const base =
    process.env.OLLAMA_URL ||
    (process.env.OLLAMA_API_KEY ? "https://ollama.com" : "http://localhost:11434");

  return base.replace(/\/+$/, "");
}

function getOllamaHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extraHeaders };
  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function requestEmbedding(url: string, body: Record<string, unknown>): Promise<number[] | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: getOllamaHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const data: any = await response.json();
  if (Array.isArray(data.embeddings) && Array.isArray(data.embeddings[0])) {
    return data.embeddings[0];
  }

  if (Array.isArray(data.embedding)) {
    return data.embedding;
  }

  return null;
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const OLLAMA_BASE = getOllamaBase();
  try {
    const embedded = await requestEmbedding(`${OLLAMA_BASE}/api/embed`, {
      model: EMBED_MODEL,
      input: text,
    });

    if (embedded) {
      return embedded;
    }

    // Backwards compatibility for older Ollama servers that still use /api/embeddings.
    return await requestEmbedding(`${OLLAMA_BASE}/api/embeddings`, {
      model: EMBED_MODEL,
      prompt: text,
    });
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
