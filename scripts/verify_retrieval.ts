import { Pool } from "pg";
import { retrievePersistent } from "../packages/knowledge-engine/retrieve";

const connectionString = "postgresql://postgres:postgres@localhost:5432/ai_workspace";

async function verify() {
  const pool = new Pool({ connectionString });
  
  const testQueries = [
    "What are the entry conditions for the Supertrend options strategy?",
    "How does the VIX affect volatility expansion?",
    "Tell me about Smart Money Concepts order blocks."
  ];

  console.log("Starting Retrieval Verification...\n");

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    const results = await retrievePersistent(query, pool, 3);
    
    if (results.length === 0) {
      console.log("No results found.");
    } else {
      results.forEach((r, i) => {
        console.log(`[${i+1}] Score: ${r.score.toFixed(4)} | Source: ${r.source}`);
        console.log(`Content Snippet: ${r.content.substring(0, 150)}...\n`);
      });
    }
    console.log("----------------------------------\n");
  }

  await pool.end();
}

verify();
