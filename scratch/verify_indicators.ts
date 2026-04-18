import { knowledgeEngine } from "../apps/server/src/services/knowledgeSingleton";

async function verify() {
  console.log("Stats:", knowledgeEngine.getStats());
  const files = knowledgeEngine.listAll();
  const rbFiles = files.filter(f => f.endsWith('.rb'));
  console.log("Total Ruby files in knowledge:", rbFiles.length);
  console.log("Sample indicators:", rbFiles.slice(0, 5));
  
  // Try a semantic retrieval
  const query = "implementation of RSI indicator";
  const results = await knowledgeEngine.retrieve(query);
  console.log("\nSemantic search results for 'RSI implementation':");
  results.forEach((r, i) => {
    console.log(`${i+1}. ${r.path} (Score: ${r.score})`);
  });
}

verify().catch(console.error);
