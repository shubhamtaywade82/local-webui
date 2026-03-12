import { Chunk } from "./chunker";
import { generateEmbedding, cosineSimilarity } from "./embed";

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

export class VectorStore {
  private chunks: EmbeddedChunk[] = [];

  async addChunk(chunk: Chunk) {
    const embedding = await generateEmbedding(chunk.content);
    if (embedding) {
      this.chunks.push({ ...chunk, embedding });
    }
  }

  async addChunks(chunks: Chunk[]) {
    // Process in batches or parallel (careful with Ollama concurrency)
    for (const chunk of chunks) {
      await this.addChunk(chunk);
    }
  }

  search(queryEmbedding: number[], limit: number = 10): { chunk: EmbeddedChunk; similarity: number }[] {
    const results = this.chunks.map(chunk => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  clear() {
    this.chunks = [];
  }

  getStats() {
    return {
      totalEmbeddedChunks: this.chunks.length
    };
  }
}
