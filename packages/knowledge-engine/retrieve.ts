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

  const dim = queryEmbedding.length;

  try {
    // Stage 1: Directory Search (skip rows with missing/wrong-dimension embeddings)
    const dirRes = await pool.query(
      `SELECT id, name, cosine_similarity(embedding, $1::double precision[]) as similarity 
       FROM knowledge_directories 
       WHERE embedding IS NOT NULL AND cardinality(embedding) = $2
       ORDER BY similarity DESC NULLS LAST
       LIMIT 2`,
      [queryEmbedding, dim]
    );
    const dirIds = dirRes.rows.map(r => r.id);
    if (dirIds.length === 0) return [];

    // Stage 2: Document Search within those directories
    const docRes = await pool.query(
      `SELECT id, title, path, cosine_similarity(embedding, $1::double precision[]) as similarity 
       FROM knowledge_documents 
       WHERE directory_id = ANY($2)
         AND embedding IS NOT NULL AND cardinality(embedding) = $3
       ORDER BY similarity DESC NULLS LAST
       LIMIT 5`,
      [queryEmbedding, dirIds, dim]
    );
    const docIds = docRes.rows.map(r => r.id);
    const docMap = new Map(docRes.rows.map(r => [r.id, r.title]));
    if (docIds.length === 0) return [];

    // Stage 3: Chunk Search within those documents
    const chunkRes = await pool.query(
      `SELECT content, document_id, cosine_similarity(embedding, $1::double precision[]) as similarity 
       FROM knowledge_chunks 
       WHERE document_id = ANY($2)
         AND embedding IS NOT NULL AND cardinality(embedding) = $4
       ORDER BY similarity DESC NULLS LAST
       LIMIT $3`,
      [queryEmbedding, docIds, limit, dim]
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
