import { BaseTool, ToolSchema } from './types';

export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description = '[STUB] Search the web — not implemented yet';
  readonly schema: ToolSchema = {
    name: 'web_search',
    description: 'Search the web (stub)',
    args: { query: { type: 'string', description: 'Search query', required: true } }
  };

  async execute(_args: Record<string, unknown>): Promise<string> {
    return 'web_search is not implemented yet. Try search_kb for local knowledge.';
  }
}

export class FetchUrlTool extends BaseTool {
  readonly name = 'fetch_url';
  readonly description = '[STUB] Fetch a URL — not implemented yet';
  readonly schema: ToolSchema = {
    name: 'fetch_url',
    description: 'Fetch URL content (stub)',
    args: { url: { type: 'string', description: 'URL to fetch', required: true } }
  };

  async execute(_args: Record<string, unknown>): Promise<string> {
    return 'fetch_url is not implemented yet.';
  }
}
