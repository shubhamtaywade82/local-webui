import matter from "gray-matter";

export function parseMarkdown(content: string) {
  const parsed = matter(content);
  return {
    metadata: parsed.data,
    body: parsed.content
  };
}
