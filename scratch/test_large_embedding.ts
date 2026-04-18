import { generateEmbedding } from "../packages/knowledge-engine/embed";

async function test() {
  console.log("--- Testing Large Embedding ---");
  const hugeString = "X".repeat(100_000); // 100k chars
  console.log(`Starting test with ${hugeString.length} character string...`);
  
  try {
    const embedding = await generateEmbedding(hugeString);
    if (embedding) {
      console.log("SUCCESS: Embedding generated (truncated internally). Vector dimension:", embedding.length);
    } else {
      console.log("FAILURE: Embedding returned null (fallback). Check logs for warning.");
    }
  } catch (err) {
    console.error("CRITICAL FAILURE: Error thrown during large embedding:", err);
  }
}

test().catch(console.error);
