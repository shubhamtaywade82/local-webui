import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { BaseTool, ToolSchema } from './types';

function safePath(workspaceRoot: string, relativePath: string): string {
  const resolved = resolve(join(workspaceRoot, relativePath));
  if (!resolved.startsWith(resolve(workspaceRoot))) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }
  return resolved;
}

export class ReadFileTool extends BaseTool {
  readonly name = 'read_file';
  readonly description = 'Read the content of a file in the workspace';
  readonly schema: ToolSchema = {
    name: 'read_file',
    description: 'Read file content',
    args: { path: { type: 'string', description: 'Relative path from workspace root', required: true } }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      return readFileSync(abs, 'utf8');
    } catch (e) {
      return `Error reading file: ${(e as Error).message}`;
    }
  }
}

export class ListFilesTool extends BaseTool {
  readonly name = 'list_files';
  readonly description = 'List files and directories at a path in the workspace';
  readonly schema: ToolSchema = {
    name: 'list_files',
    description: 'List files in directory',
    args: { path: { type: 'string', description: 'Relative path from workspace root', required: true } }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      const entries = readdirSync(abs, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`).join('\n');
    } catch (e) {
      return `Error listing files: ${(e as Error).message}`;
    }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = 'edit_file';
  readonly description = 'Overwrite an existing file with new content';
  readonly schema: ToolSchema = {
    name: 'edit_file',
    description: 'Edit file content',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      content: { type: 'string', description: 'New file content', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      writeFileSync(abs, String(args.content), 'utf8');
      return `File written: ${args.path}`;
    } catch (e) {
      return `Error editing file: ${(e as Error).message}`;
    }
  }
}

export class CreateFileTool extends BaseTool {
  readonly name = 'create_file';
  readonly description = 'Create a new file with content';
  readonly schema: ToolSchema = {
    name: 'create_file',
    description: 'Create new file',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      content: { type: 'string', description: 'Initial file content', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, String(args.content), 'utf8');
      return `File created: ${args.path}`;
    } catch (e) {
      return `Error creating file: ${(e as Error).message}`;
    }
  }
}

export class DeleteFileTool extends BaseTool {
  readonly name = 'delete_file';
  readonly description = 'Delete a file (requires confirm: true)';
  readonly schema: ToolSchema = {
    name: 'delete_file',
    description: 'Delete a file',
    args: {
      path: { type: 'string', description: 'Relative path from workspace root', required: true },
      confirm: { type: 'boolean', description: 'Must be true to proceed with deletion', required: true }
    }
  };

  constructor(private workspaceRoot: string) { super(); }

  async execute(args: Record<string, unknown>): Promise<string> {
    if (args.confirm !== true) {
      return 'Deletion refused. Pass confirm: true to delete files.';
    }
    try {
      const abs = safePath(this.workspaceRoot, String(args.path));
      rmSync(abs);
      return `Deleted: ${args.path}`;
    } catch (e) {
      return `Error deleting file: ${(e as Error).message}`;
    }
  }
}
