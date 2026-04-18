import { Pool } from "pg";
import { ingestKnowledge } from "../packages/knowledge-engine/ingestor";
import path from "path";

// Hardcoded for the script or use env
const connectionString = "postgresql://postgres:postgres@localhost:5432/ai_workspace";

async function run() {
  const pool = new Pool({ connectionString });
  const kbPath = path.join(process.cwd(), process.env.KNOWLEDGE_INGEST_PATH || "knowledge");
  
  console.log(`Starting ingestion from: ${kbPath}`);
  
  try {
    await ingestKnowledge(kbPath, pool);
  } catch (error) {
    console.error("Ingestion failed:", error);
  } finally {
    await pool.end();
  }
}

run();
