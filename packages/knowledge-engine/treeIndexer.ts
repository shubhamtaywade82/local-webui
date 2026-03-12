import fs from "fs";
import path from "path";

export interface DirectoryNode {
  name: string;
  path: string;
  summary: string;
}

export function scanKnowledgeTree(root: string): DirectoryNode[] {
  const nodes: DirectoryNode[] = [];
  if (!fs.existsSync(root)) return nodes;

  const entries = fs.readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const dirPath = path.join(root, entry.name);
      const indexPath = path.join(dirPath, "index.md");
      
      let summary = "";
      if (fs.existsSync(indexPath)) {
        summary = fs.readFileSync(indexPath, "utf8");
      }

      nodes.push({
        name: entry.name,
        path: dirPath,
        summary
      });
    }
  }

  return nodes;
}
