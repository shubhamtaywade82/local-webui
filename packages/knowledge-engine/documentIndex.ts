import fs from "fs";
import path from "path";

export interface DocumentNode {
  name: string;
  path: string;
  summary: string;
}

const SUPPORTED_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".jsx", ".py", ".json", ".css", ".html", ".sql", ".rb"];
const IGNORED_DIRS = ["node_modules", ".git", "dist", "build", "coverage"];

export function scanDocuments(dirPath: string): DocumentNode[] {
  const nodes: DocumentNode[] = [];
  if (!fs.existsSync(dirPath)) return nodes;

  function walk(currentPath: string) {
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext) && entry.name !== "index.md") {
          try {
            const content = fs.readFileSync(fullPath, "utf8");
            const summary = content.split("\n\n")[0].substring(0, 300);

            nodes.push({
              name: entry.name,
              path: fullPath,
              summary
            });
          } catch (e) {
            // Skip binary or unreadable files
          }
        }
      }
    }
  }

  walk(dirPath);
  return nodes;
}
