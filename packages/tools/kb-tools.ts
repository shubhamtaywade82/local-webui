import { BaseTool, ToolSchema } from './types';

export class SearchKbTool extends BaseTool {
  readonly name = 'search_kb';
  readonly description = 'Semantic search over the knowledge base documents';
  readonly schema: ToolSchema = {
    name: 'search_kb',
    description: 'Search knowledge base',
    args: { query: { type: 'string', description: 'Search query', required: true } }
  };

  constructor(private knowledgeEngine: { retrieve: (q: string) => Promise<Array<{ path: string; content: string }>> }) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const docs = await this.knowledgeEngine.retrieve(String(args.query));
      if (docs.length === 0) return 'No matching documents found.';
      return docs.map(d => `FILE: ${d.path}\n${d.content}`).join('\n\n---\n\n');
    } catch (e) {
      return `Search error: ${(e as Error).message}`;
    }
  }
}

export class IngestDocumentTool extends BaseTool {
  readonly name = 'ingest_document';
  readonly description = 'Add a document to the knowledge base and trigger re-indexing';
  readonly schema: ToolSchema = {
    name: 'ingest_document',
    description: 'Ingest document into knowledge base',
    args: { path: { type: 'string', description: 'Absolute or relative path to markdown file', required: true } }
  };

  constructor(private knowledgeEngine: { refresh: () => Promise<void>; ingest: () => Promise<void> }) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      await this.knowledgeEngine.refresh();
      await this.knowledgeEngine.ingest();
      return `Document ingested and knowledge base refreshed. Path: ${args.path}`;
    } catch (e) {
      return `Ingest error: ${(e as Error).message}`;
    }
  }
}
