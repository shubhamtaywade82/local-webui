export interface Chunk {
  id: string;
  path: string;
  index: number;
  content: string;
  header: string;
}

export function chunkMarkdown(path: string, text: string): Chunk[] {
  // Split using header-aware partitioning
  // We look for second-level headers specifically
  const sections = text.split(/\n## /);
  const chunks: Chunk[] = [];

  sections.forEach((s, i) => {
    const cleaned = s.trim();
    if (cleaned.length < 50) return; // Skip very small fragments

    const lines = cleaned.split("\n");
    const header = i === 0 ? "Introduction" : lines[0];

    chunks.push({
      id: `${path}#${i}`,
      path,
      index: i,
      content: i === 0 ? cleaned : `## ${cleaned}`, // Restore header for subsequent chunks
      header
    });
  });

  return chunks;
}
