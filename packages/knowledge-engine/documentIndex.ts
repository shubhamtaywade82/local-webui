import fs from "fs";
import path from "path";

export interface DocumentNode {
  name: string;
  path: string;
  summary: string;
}

export function scanDocuments(dirPath: string): DocumentNode[] {
  const nodes: DocumentNode[] = [];
  if (!fs.existsSync(dirPath)) return nodes;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md") {
      const fullPath = path.join(dirPath, entry.name);
      const content = fs.readFileSync(fullPath, "utf8");
      
      // Extract first paragraph or first 200 chars as summary
      const summary = content.split("\n\n")[0].substring(0, 300);

      nodes.push({
        name: entry.name,
        path: fullPath,
        summary
      });
    }
  }

  return nodes;
}
