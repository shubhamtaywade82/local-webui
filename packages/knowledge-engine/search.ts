import { Chunk } from "./chunker";

export interface ScoredChunk extends Chunk {
  score: number;
  keywordScore: number;
  vectorScore: number;
}

export interface SearchOptions {
  limit?: number;
  semanticWeight?: number;
  keywordWeight?: number;
}

export function hybridSearch(
  query: string,
  chunks: Chunk[],
  vectorResults: { chunkId: string; similarity: number }[] | null,
  options: SearchOptions = {}
): ScoredChunk[] {
  let { limit = 5, semanticWeight = 0.7, keywordWeight = 0.3 } = options;

  // Use 100% keyword search if semantic results are unavailable
  if (!vectorResults) {
    semanticWeight = 0;
    keywordWeight = 1.0;
  }

  const queryWords = query.toLowerCase()
    .split(/[\s,.;!?]+/)
    .filter(w => w.length > 2);

  const vectorScoresMap = new Map(vectorResults?.map(r => [r.chunkId, r.similarity]) || []);

  const scored = chunks.map(chunk => {
    const content = chunk.content.toLowerCase();
    const header = chunk.header?.toLowerCase() || "";
    let keywordScore = 0;

    // Keyword scoring (BM25-lite)
    if (queryWords.length > 0) {
      queryWords.forEach(word => {
        if (content.includes(word)) keywordScore += 1;
        if (header.includes(word)) {
          keywordScore += 3; // Weight headers heavily
        }
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(content)) keywordScore += 2; // Exact word match bonus
      });
    }

    // Normalize keyword score (cap at 1.0 for hybrid blending)
    const normalizedKeywordScore = Math.min(keywordScore / 10, 1.0);
    const vectorScore = vectorScoresMap.get(chunk.id) || 0;

    // Hybrid score formula
    const totalScore = (vectorScore * semanticWeight) + (normalizedKeywordScore * keywordWeight);

    return { 
      ...chunk, 
      score: totalScore,
      keywordScore: normalizedKeywordScore,
      vectorScore
    };
  });

  return scored
    .filter(c => c.score > 0.02) // Maintain a low threshold for discovery
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
