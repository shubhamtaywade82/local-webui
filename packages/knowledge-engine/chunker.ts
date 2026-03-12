export interface Chunk {
  id: string;
  file: string;
  content: string;
  header?: string;
}

export function chunkMarkdown(file: string, content: string): Chunk[] {
  // Split by headers (Level 1 and Level 2 are primary split points)
  const sections = content.split(/\n(?=#{1,2}\s)/);
  const chunks: Chunk[] = [];

  sections.forEach((section, i) => {
    const trimmed = section.trim();
    if (trimmed.length < 50) return; // Skip very small chunks

    // Extract header if possible
    const headerMatch = trimmed.match(/^#{1,6}\s+(.*)/);
    const header = headerMatch ? headerMatch[1] : undefined;

    chunks.push({
      id: `${file}-${i}`,
      file,
      content: trimmed,
      header
    });
  });

  // If no headers found or content too small to split, return as one chunk
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({
      id: `${file}-0`,
      file,
      content: content.trim()
    });
  }

  return chunks;
}
