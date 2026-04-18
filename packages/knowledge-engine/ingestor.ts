import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { scanDocuments } from "./documentIndex";
import { chunkMarkdown } from "./chunker";
import { embed } from "./embedder";

const SUPPORTED_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".css", ".html", ".sql"];

export async function ingestKnowledge(root: string, pool: Pool) {
  const allDocs = scanDocuments(root);
  console.log(`[Ingestor] Found ${allDocs.length} documents in root: ${root}`);

  // For the existing schema, we'll treat each file's parent directory as a "knowledge_directory"
  for (const doc of allDocs) {
    const parentPath = path.dirname(doc.path);
    const parentName = path.basename(parentPath);

    // 1. Ensure Directory entry exists
    const dirRes = await pool.query(
      `INSERT INTO knowledge_directories (name, path, summary, embedding)
       VALUES($1, $2, $3, $4)
       ON CONFLICT (path) DO UPDATE SET summary = EXCLUDED.summary
       RETURNING id`,
      [parentName, parentPath, `Files in ${parentPath}`, null]
    );

    const dirId = dirRes.rows[0].id;
    const content = fs.readFileSync(doc.path, "utf8");
    const isMarkdown = doc.path.endsWith(".md");
    
    // 2. Ingest Document
    const summary = content.slice(0, 500);
    const docEmbedding = await embed(content.slice(0, 1000));
    const docRes = await pool.query(
      `INSERT INTO knowledge_documents (directory_id, title, path, summary, metadata, embedding)
       VALUES($1, $2, $3, $4, $5, $6)
       ON CONFLICT (path) DO UPDATE SET 
          summary = EXCLUDED.summary, 
          embedding = EXCLUDED.embedding
       RETURNING id`,
      [dirId, doc.name, doc.path, summary, JSON.stringify({ ext: path.extname(doc.path) }), docEmbedding]
    );

    const docId = docRes.rows[0].id;
    await pool.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [docId]);

    // 3. Ingest Chunks
    let chunks;
    if (isMarkdown) {
      chunks = chunkMarkdown(doc.path, content);
    } else {
      // For non-markdown (code, logs, json), split by character limit if large
      const MAX_NON_MD_CHUNK = 2500;
      if (content.length > MAX_NON_MD_CHUNK) {
        chunks = [];
        for (let i = 0; i < content.length; i += MAX_NON_MD_CHUNK) {
          chunks.push({
            id: `${doc.path}#${Math.floor(i / MAX_NON_MD_CHUNK)}`,
            path: doc.path,
            index: Math.floor(i / MAX_NON_MD_CHUNK),
            content: content.slice(i, i + MAX_NON_MD_CHUNK),
            header: `${doc.name} (Part ${Math.floor(i / MAX_NON_MD_CHUNK) + 1})`
          });
        }
      } else {
        chunks = [{
          id: `${doc.path}#0`,
          path: doc.path,
          index: 0,
          content: content,
          header: doc.name
        }];
      }
    }

    for (const chunk of chunks) {
      const chunkEmbedding = await embed(chunk.content);
      if (chunkEmbedding) {
        await pool.query(
          `INSERT INTO knowledge_chunks (document_id, content, chunk_index, token_count, embedding)
           VALUES($1, $2, $3, $4, $5)`,
          [docId, chunk.content, chunk.index, Math.ceil(chunk.content.length / 4), chunkEmbedding]
        );
      }
    }
  }
  console.log(`[Ingestor] Ingestion complete for root: ${root}`);
}
