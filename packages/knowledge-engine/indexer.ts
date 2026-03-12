import fs from "fs";
import path from "path";
import { chunkMarkdown, Chunk } from "./chunker";

export function indexKnowledge(rootDirectory: string): Chunk[] {
  const allChunks: Chunk[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
        const content = fs.readFileSync(fullPath, "utf8");
        const relativePath = path.relative(rootDirectory, fullPath);
        const chunks = chunkMarkdown(relativePath, content);
        allChunks.push(...chunks);
      }
    }
  }

  walk(rootDirectory);
  return allChunks;
}
