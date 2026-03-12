import { scanKnowledgeTree, DirectoryNode } from "./treeIndexer";
import { scanDocuments, DocumentNode } from "./documentIndex";
import { chunkMarkdown, Chunk } from "./chunker";
import { hybridSearch, ScoredChunk, SearchOptions } from "./search";
import { buildContext, wrapPrompt } from "./contextBuilder";
import { VectorStore } from "./vectorStore"; // We'll adapt vector store to be hierarchical if needed, but for now flat vectors for chunks is fine once doc is filtered
import { generateEmbedding } from "./embed";

export class KnowledgeEngine {
  private directories: DirectoryNode[] = [];
  private documentMap: Map<string, DocumentNode[]> = new Map();
  private chunkMap: Map<string, Chunk[]> = new Map(); // Doc path -> Chunks
  private vectorStore: VectorStore = new VectorStore();
  private isIndexing: boolean = false;

  constructor(private root: string) {
    this.refresh().catch(err => console.error("KnowledgeEngine init failed:", err));
  }

  async refresh() {
    if (this.isIndexing) return;
    this.isIndexing = true;
    
    try {
      this.directories = scanKnowledgeTree(this.root);
      this.documentMap.clear();
      this.chunkMap.clear();
      this.vectorStore.clear();

      for (const dir of this.directories) {
        const docs = scanDocuments(dir.path);
        this.documentMap.set(dir.path, docs);

        for (const doc of docs) {
          const content = require('fs').readFileSync(doc.path, "utf8");
          const chunks = chunkMarkdown(doc.path, content);
          this.chunkMap.set(doc.path, chunks);
          await this.vectorStore.addChunks(chunks);
        }
      }
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Level 1: Filter Directories
   */
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

  /**
   * Level 2: Filter Documents in selected directories
   */
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

  /**
   * Hierarchical Retrieval
   */
  async retrieve(query: string, options: SearchOptions = {}): Promise<ScoredChunk[]> {
    // Stage 1 & 2: Filter down to candidate chunks
    let candidateChunks: Chunk[] = [];
    
    // Attempt Level 1 Filtering
    const selectedDirs = this.filterDirectories(query);
    const targetDirs = selectedDirs.length > 0 ? selectedDirs : this.directories; // Fallback to all if no clear match

    // Attempt Level 2 Filtering
    const selectedDocs = this.filterDocuments(query, targetDirs);
    const targetDocs = selectedDocs.length > 0 ? selectedDocs : Array.from(this.documentMap.values()).flat();

    // Collect chunks from filtered docs
    for (const doc of targetDocs) {
      candidateChunks.push(...(this.chunkMap.get(doc.path) || []));
    }

    // Stage 3: Perform Hybrid Search on candidates
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

  async getAugmentedPrompt(query: string, options: SearchOptions = {}): Promise<string> {
    const relevantChunks = await this.retrieve(query, options);
    const context = buildContext(relevantChunks);
    return wrapPrompt(query, context);
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