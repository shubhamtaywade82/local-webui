const MAX_CHUNK_LENGTH = 2500;
const CHUNK_OVERLAP = 200;

export interface Chunk {
  id: string;
  path: string;
  index: number;
  content: string;
  header: string;
}

export function chunkMarkdown(path: string, text: string): Chunk[] {
  // 1. Initial split using header-aware partitioning (Level 2 headers)
  const sections = text.split(/\n## /);
  const chunks: Chunk[] = [];

  sections.forEach((s, i) => {
    let cleaned = s.trim();
    if (i > 0) cleaned = `## ${cleaned}`; // Restore header
    
    if (cleaned.length < 20) return; // Skip only extremely small noise

    const lines = cleaned.split("\n");
    const header = i === 0 ? "Introduction" : lines[0].replace(/^##\s+/, "");

    // 2. Recursive Split: If section is too large, sub-divide it
    if (cleaned.length > MAX_CHUNK_LENGTH) {
      const subChunks = splitFurther(cleaned, MAX_CHUNK_LENGTH, CHUNK_OVERLAP);
      subChunks.forEach((sc, j) => {
        chunks.push({
          id: `${path}#${i}-${j}`,
          path,
          index: i + (j / 100), // Fractional index for ordering
          content: sc,
          header: j === 0 ? header : `${header} (cont. ${j})`
        });
      });
    } else {
      chunks.push({
        id: `${path}#${i}`,
        path,
        index: i,
        content: cleaned,
        header
      });
    }
  });

  return chunks;
}

/**
 * Splits a text into overlapping character-level chunks.
 */
function splitFurther(text: string, size: number, overlap: number): string[] {
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    result.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }
  return result;
}
