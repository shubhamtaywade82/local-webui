import { Pool } from 'pg';
import { BaseTool, ToolSchema } from './types';

const BLOCKED_KEYWORDS = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE)\b/i;

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.AGENT_SANDBOX_DB_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace',
  });
}

export class QueryDatabaseTool extends BaseTool {
  readonly name = 'query_database';
  readonly description = 'Run a SELECT query against the database. No mutations allowed.';
  readonly schema: ToolSchema = {
    name: 'query_database',
    description: 'Execute a SELECT SQL query',
    args: { sql: { type: 'string', description: 'SQL SELECT statement', required: true } }
  };

  private pool: Pool;
  constructor(pool?: Pool) {
    super();
    this.pool = pool ?? createPool();
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const sql = String(args.sql);
    if (BLOCKED_KEYWORDS.test(sql)) {
      return 'Error: Only SELECT queries are allowed.';
    }
    try {
      const result = await this.pool.query(sql);
      if (result.rows.length === 0) return 'Query returned 0 rows.';
      const cols = result.fields.map(f => f.name);
      const rows = result.rows.map(r => cols.map(c => String(r[c] ?? '')).join(' | ')).join('\n');
      return `${cols.join(' | ')}\n${'-'.repeat(40)}\n${rows}\n(${result.rows.length} rows)`;
    } catch (e) {
      return `Query error: ${(e as Error).message}`;
    }
  }
}

export class DescribeSchemaTool extends BaseTool {
  readonly name = 'describe_schema';
  readonly description = 'Return the table and column names available in the database';
  readonly schema: ToolSchema = {
    name: 'describe_schema',
    description: 'Describe database schema',
    args: {}
  };

  private pool: Pool;
  constructor(pool?: Pool) {
    super();
    this.pool = pool ?? createPool();
  }

  async execute(_args: Record<string, unknown>): Promise<string> {
    try {
      const schema = process.env.AGENT_SANDBOX_DB_URL ? 'agent_sandbox' : 'public';
      const result = await this.pool.query(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = $1
         ORDER BY table_name, ordinal_position`,
        [schema]
      );
      const tables: Record<string, string[]> = {};
      for (const row of result.rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
      }
      if (Object.keys(tables).length === 0) return `No tables found in schema "${schema}".`;
      return Object.entries(tables)
        .map(([t, cols]) => `${t}:\n  ${cols.join('\n  ')}`)
        .join('\n\n');
    } catch (e) {
      return `Schema error: ${(e as Error).message}`;
    }
  }
}
