import { chunkMarkdown } from "../packages/knowledge-engine/chunker";

function test() {
  console.log("--- Testing Recursive Chunking ---");
  const largeSection = "Words ".repeat(1000); // ~6000 chars
  const markdown = `# Large Doc\n\n## Introduction\nThis is short.\n\n## Big Section\n${largeSection}\n\n## Conclusion\nEnd.`;
  
  console.log(`Markdown length: ${markdown.length} chars.`);
  const chunks = chunkMarkdown("test.md", markdown);
  
  console.log(`Total chunks generated: ${chunks.length}`);
  chunks.forEach((c, idx) => {
    console.log(`Chunk ${idx} [ID: ${c.id}] [Header: ${c.header}] [Len: ${c.content.length}]`);
  });

  const subChunks = chunks.filter(c => c.id.includes("-"));
  if (subChunks.length > 0) {
    console.log(`SUCCESS: Recursive chunking triggered. Found ${subChunks.length} sub-chunks for Big Section.`);
  } else {
    console.log("FAILURE: Recursive chunking NOT triggered for large section.");
  }
}

test();
