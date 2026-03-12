import fs from "fs";
import path from "path";

export class KnowledgeEngine {
  constructor(private root: string) {}

  loadIndex() {
    const indexPath = path.join(this.root, "index.md");
    if (!fs.existsSync(indexPath)) return [];
    
    const index = fs.readFileSync(indexPath, "utf8");
    const links = [...index.matchAll(/-\s(.+)/g)].map(x => x[1]);
    return links;
  }

  readFile(file: string) {
    try {
      return fs.readFileSync(path.join(this.root, file), "utf8");
    } catch {
      return "";
    }
  }

  retrieve(query: string) {
    const files = this.loadIndex();
    const docs = files.map(f => ({
      path: f,
      content: this.readFile(f)
    }));
    return docs.filter(doc => doc.content.toLowerCase().includes(query.toLowerCase()));
  }
}