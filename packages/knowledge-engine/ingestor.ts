import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { scanRepo } from "./scanner";
import { parseMarkdown } from "./parser";
import { chunkMarkdown } from "./chunker";
import { embed } from "./embedder";

export async function ingestKnowledge(root: string, pool: Pool) {
  const directories = scanRepo(root);
  console.log(`Found ${directories.length} directories to ingest.`);

  for (const dir of directories) {
    console.log(`Ingesting directory: ${dir.name}`);
    
    // Level 1: Ingest Directory
    const dirEmbedding = await embed(dir.summary || dir.name);
    const dirRes = await pool.query(
      `INSERT INTO knowledge_directories (name, path, summary, embedding)
       VALUES($1, $2, $3, $4)
       ON CONFLICT (path) DO UPDATE SET summary = EXCLUDED.summary, embedding = EXCLUDED.embedding
       RETURNING id`,
      [dir.name, dir.path, dir.summary, dirEmbedding]
    );

    const dirId = dirRes.rows[0].id;
    const files = fs.readdirSync(dir.path);

    for (const file of files) {
      if (!file.endsWith(".md") || file === "index.md") continue;

      const fullPath = path.join(dir.path, file);
      const content = fs.readFileSync(fullPath, "utf8");
      const { metadata, body } = parseMarkdown(content);

      console.log(`  Processing file: ${file}`);

      // Level 2: Ingest Document
      const docEmbedding = await embed(body.slice(0, 1000));
      const docRes = await pool.query(
        `INSERT INTO knowledge_documents (directory_id, title, path, summary, metadata, embedding)
         VALUES($1, $2, $3, $4, $5, $6)
         ON CONFLICT (path) DO UPDATE SET 
            summary = EXCLUDED.summary, 
            metadata = EXCLUDED.metadata, 
            embedding = EXCLUDED.embedding
         RETURNING id`,
        [dirId, file, fullPath, body.slice(0, 500), JSON.stringify(metadata), docEmbedding]
      );

      const docId = docRes.rows[0].id;

      // Clear old chunks for this document to prevent duplicates on update
      await pool.query(`DELETE FROM knowledge_chunks WHERE document_id = $1`, [docId]);

      // Level 3: Ingest Chunks
      const chunks = chunkMarkdown(fullPath, body);
      for (const chunk of chunks) {
        const chunkEmbedding = await embed(chunk.content);
        if (chunkEmbedding) {
          await pool.query(
            `INSERT INTO knowledge_chunks (document_id, content, chunk_index, token_count, embedding)
             VALUES($1, $2, $3, $4, $5)`,
            [
              docId,
              chunk.content,
              chunk.index,
              Math.ceil(chunk.content.length / 4), // Rough token approximation
              chunkEmbedding
            ]
          );
        }
      }
    }
  }
  console.log("Ingestion complete.");
}
