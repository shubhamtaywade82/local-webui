import { scanKnowledgeTree, DirectoryNode } from "./treeIndexer";
import { scanDocuments, DocumentNode } from "./documentIndex";
import { chunkMarkdown, Chunk } from "./chunker";
import { hybridSearch, ScoredChunk, SearchOptions } from "./search";
import { buildContext, wrapPrompt } from "./contextBuilder";
import { VectorStore } from "./vectorStore"; 
import { generateEmbedding } from "./embed";
import { Pool } from "pg";
import { retrievePersistent } from "./retrieve";
import { ingestKnowledge } from "./ingestor";

export class KnowledgeEngine {
  private roots: string[];
  private directories: DirectoryNode[] = [];
  private documentMap: Map<string, DocumentNode[]> = new Map();
  private chunkMap: Map<string, Chunk[]> = new Map(); // Doc path -> Chunks
  private vectorStore: VectorStore = new VectorStore();
  private isIndexing: boolean = false;
  private pool: Pool;

  constructor(roots: string | string[]) {
    this.roots = Array.isArray(roots) ? roots : [roots];
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/ai_workspace"
    });
    this.refresh().catch(err => console.error("KnowledgeEngine init failed:", err));
  }

  async refresh() {
    if (this.isIndexing) return;
    this.isIndexing = true;
    
    try {
      this.documentMap.clear();
      this.chunkMap.clear();
      this.vectorStore.clear();

      for (const root of this.roots) {
        console.log(`[KnowledgeEngine] Refreshing from root: ${root}`);
        // For documentation hierarchies, we still want the level-1 directory structure
        const rootDirs = scanKnowledgeTree(root);
        this.directories = [...this.directories, ...rootDirs];

        // But for file discovery, we use the new recursive scanner on the entire root
        const docs = scanDocuments(root);
        this.documentMap.set(root, docs);

        for (const doc of docs) {
          try {
            const content = require('fs').readFileSync(doc.path, "utf8");
            const chunks = chunkMarkdown(doc.path, content);
            this.chunkMap.set(doc.path, chunks);
            await this.vectorStore.addChunks(chunks);
          } catch (e) {
            console.warn(`[KnowledgeEngine] Failed to read ${doc.path}:`, e);
          }
        }
      }
      console.log(`[KnowledgeEngine] Refresh complete. Total documents: ${Array.from(this.documentMap.values()).flat().length}`);
    } finally {
      this.isIndexing = false;
    }
  }

  async ingest() {
    for (const root of this.roots) {
      console.log(`[KnowledgeEngine] Triggering persistent ingestion for: ${root}`);
      try {
        await ingestKnowledge(root, this.pool);
      } catch (err) {
        console.error(`[KnowledgeEngine] Ingestion failed for ${root}:`, err);
      }
    }
    await this.refresh(); // Sync in-memory state after all roots are ingested
  }

  /**
   * Powerful Semantic Retrieval (DB-backed)
   */
  async retrieve(query: string, options: SearchOptions = {}): Promise<ScoredChunk[]> {
    // Try persistent DB retrieval first
    const persistentResults = await retrievePersistent(query, this.pool, options.limit || 5);
    
    if (persistentResults.length > 0) {
      return persistentResults.map(r => ({
        id: r.source,
        path: r.source,
        content: r.content,
        header: "",
        index: 0,
        score: r.score,
        keywordScore: 0,
        vectorScore: r.score
      }));
    }

    // Fallback to in-memory hierarchical retrieval if DB is empty/fails
    let candidateChunks: Chunk[] = [];
    const selectedDirs = this.filterDirectories(query);
    const targetDirs = selectedDirs.length > 0 ? selectedDirs : this.directories; 
    const selectedDocs = this.filterDocuments(query, targetDirs);
    const targetDocs = selectedDocs.length > 0 ? selectedDocs : Array.from(this.documentMap.values()).flat();

    for (const doc of targetDocs) {
      candidateChunks.push(...(this.chunkMap.get(doc.path) || []));
    }

    const queryEmbedding = await generateEmbedding(query);
    let vectorScores: { chunkId: string; similarity: number }[] | null = null;
    
    if (queryEmbedding) {
      const vectorResults = this.vectorStore.search(queryEmbedding, 50);
      vectorScores = vectorResults.map(r => ({
        chunkId: r.chunk.id,
        similarity: r.similarity
      }));
    }

    return hybridSearch(query, candidateChunks, vectorScores, options);
  }

  private filterDirectories(query: string, limit: number = 2): DirectoryNode[] {
    const queryLower = query.toLowerCase();
    return this.directories.map(dir => {
      let score = 0;
      if (dir.name.toLowerCase().includes(queryLower)) score += 5;
      if (dir.summary.toLowerCase().includes(queryLower)) score += 2;
      return { dir, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.dir)
    .slice(0, limit);
  }

  private filterDocuments(query: string, selectedDirs: DirectoryNode[], limit: number = 5): DocumentNode[] {
    const queryLower = query.toLowerCase();
    const allRelevantDocs: { doc: DocumentNode, score: number }[] = [];

    for (const dir of selectedDirs) {
      const docs = this.documentMap.get(dir.path) || [];
      docs.forEach(doc => {
        let score = 0;
        if (doc.name.toLowerCase().includes(queryLower)) score += 5;
        if (doc.summary.toLowerCase().includes(queryLower)) score += 2;
        allRelevantDocs.push({ doc, score });
      });
    }

    return allRelevantDocs
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.doc)
      .slice(0, limit);
  }

  async getAugmentedPrompt(query: string, options: SearchOptions = {}): Promise<string> {
    const relevantChunks = await this.retrieve(query, options);
    const context = buildContext(relevantChunks);
    return wrapPrompt(query, context);
  }

  listAll(): string[] {
    return Array.from(this.documentMap.values())
      .flat()
      .map(doc => {
        const matchingRoot = this.roots.find(root => doc.path.startsWith(root));
        return matchingRoot
          ? doc.path.replace(matchingRoot, "").replace(/^\//, "")
          : doc.path;
      });
  }

  getStats() {
    return {
      totalDirectories: this.directories.length,
      totalDocuments: Array.from(this.documentMap.values()).flat().length,
      totalChunks: Array.from(this.chunkMap.values()).flat().length,
      totalEmbeddedChunks: this.vectorStore.getStats().totalEmbeddedChunks,
      isIndexing: this.isIndexing
    };
  }
}
