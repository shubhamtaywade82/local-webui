import path from "path";

/**
 * On-disk markdown tree for KnowledgeEngine (directories with index.md + *.md).
 * Relative paths resolve from process.cwd() (typically apps/server when using `pnpm dev`).
 */
export function resolveKnowledgeRoot(): string {
  const relative = process.env.KNOWLEDGE_ROOT || "../../knowledge";
  return path.resolve(process.cwd(), relative);
}
