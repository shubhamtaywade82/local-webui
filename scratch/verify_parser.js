// Simple test runner for the new parser logic
const parseToolCall = (content) => {
  const blocks = content.match(/\{[\s\S]*\}/g) || [];
  for (const block of blocks) {
    try {
      const cleaned = block.replace(/,\s*(\}|\])/g, '$1').replace(/\\n/g, '\n').trim();
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.tool === 'string') return parsed;
    } catch {}
  }
  return null;
};

const testCases = [
  { 
    name: "Prose + JSON", 
    content: "Sure, I can help. Here is the call: {\"thought\": \"looking up rsi\", \"tool\": \"search_kb\", \"args\": {\"query\": \"rsi\"}} hope this helps!" 
  },
  { 
    name: "Trailing Comma", 
    content: "{\"tool\": \"finish\", \"args\": {\"answer\": \"done\",},}" 
  },
  { 
    name: "Markdown Wrap", 
    content: "```json\n{\"tool\": \"run_code\", \"args\": {}}\n```" 
  }
];

testCases.forEach(tc => {
  const result = parseToolCall(tc.content);
  console.log(`Test: ${tc.name} -> ${result ? "PASSED" : "FAILED"}`);
  if (result) console.log(`  Extracted: ${result.tool}`);
});
