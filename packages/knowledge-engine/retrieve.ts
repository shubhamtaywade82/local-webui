import { Pool } from "pg";
import { embed } from "./embedder";

export interface RetrievalResult {
  content: string;
  source: string;
  score: number;
}

export async function retrievePersistent(query: string, pool: Pool, limit: number = 5): Promise<RetrievalResult[]> {
  const queryEmbedding = await embed(query);
  if (!queryEmbedding) return [];

  try {
    // Stage 1: Directory Search
    const dirRes = await pool.query(
      `SELECT id, name, cosine_similarity(embedding, $1) as similarity 
       FROM knowledge_directories 
       ORDER BY similarity DESC LIMIT 2`,
      [queryEmbedding]
    );
    const dirIds = dirRes.rows.map(r => r.id);

    // Stage 2: Document Search within those directories
    const docRes = await pool.query(
      `SELECT id, title, path, cosine_similarity(embedding, $1) as similarity 
       FROM knowledge_documents 
       WHERE directory_id = ANY($2)
       ORDER BY similarity DESC LIMIT 5`,
      [queryEmbedding, dirIds]
    );
    const docIds = docRes.rows.map(r => r.id);
    const docMap = new Map(docRes.rows.map(r => [r.id, r.title]));

    // Stage 3: Chunk Search within those documents
    const chunkRes = await pool.query(
      `SELECT content, document_id, cosine_similarity(embedding, $1) as similarity 
       FROM knowledge_chunks 
       WHERE document_id = ANY($2)
       ORDER BY similarity DESC LIMIT $3`,
      [queryEmbedding, docIds, limit]
    );

    return chunkRes.rows.map(r => ({
      content: r.content,
      source: docMap.get(r.document_id) || "Unknown",
      score: r.similarity
    }));
  } catch (error) {
    console.error("Retrieval failed:", error);
    return [];
  }
}
