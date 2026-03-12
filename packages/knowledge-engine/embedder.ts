export async function embed(text: string): Promise<number[] | null> {
  // Pure JS Feature Hashing Vectorizer
  // This provides a deterministic "keyword-semantic" vector without native dependencies.
  const VECTOR_SIZE = 384; 
  const vector = new Array(VECTOR_SIZE).fill(0);
  
  const words = text.toLowerCase()
    .split(/[\s,.;!?]+/)
    .filter(w => w.length > 2);

  if (words.length === 0) return vector;

  for (const word of words) {
    // Simple hash function (Murmur-like)
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }

    const index = Math.abs(hash) % VECTOR_SIZE;
    // We use a weighted contribution for more frequent/important tokens
    vector[index] += 1;
  }

  // Normalize the vector (L2 Norm)
  const magnitude = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      vector[i] /= magnitude;
    }
  }

  return vector;
}
