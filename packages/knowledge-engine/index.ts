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

  listAll() {
    return this.loadIndex();
  }

  retrieve(query: string) {
    const files = this.loadIndex();
    const docs = files.map(f => ({
      path: f,
      content: this.readFile(f)
    }));

    const queryWords = query.toLowerCase()
      .split(/[\s,.;!?]+/)
      .filter(w => w.length > 2); // Slightly more inclusive
    
    if (queryWords.length === 0) return [];

    return docs.map(doc => {
      const content = doc.content.toLowerCase();
      let score = 0;
      
      queryWords.forEach(word => {
        if (content.includes(word)) {
          score += 1;
          // Bonus for exact matches of whole words
          const regex = new RegExp(`\\b${word}\\b`, 'i');
          if (regex.test(content)) score += 2;
        }
      });

      return { ...doc, score };
    })
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Return top 3 most relevant docs
  }
}