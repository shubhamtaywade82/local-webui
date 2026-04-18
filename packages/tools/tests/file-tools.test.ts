import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ReadFileTool, ListFilesTool, EditFileTool, CreateFileTool, DeleteFileTool } from '../file-tools';

const TMP = join(process.cwd(), 'test-tmp-workspace');

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('ReadFileTool', () => {
  it('reads file content', async () => {
    writeFileSync(join(TMP, 'hello.txt'), 'hello world');
    const tool = new ReadFileTool(TMP);
    const result = await tool.execute({ path: 'hello.txt' });
    expect(result).toBe('hello world');
  });

  it('returns error string for missing file', async () => {
    const tool = new ReadFileTool(TMP);
    const result = await tool.execute({ path: 'missing.txt' });
    expect(result).toContain('Error');
  });
});

describe('ListFilesTool', () => {
  it('lists files in directory', async () => {
    writeFileSync(join(TMP, 'a.ts'), '');
    writeFileSync(join(TMP, 'b.ts'), '');
    const tool = new ListFilesTool(TMP);
    const result = await tool.execute({ path: '.' });
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });
});

describe('EditFileTool', () => {
  it('overwrites file content', async () => {
    writeFileSync(join(TMP, 'edit.ts'), 'old');
    const tool = new EditFileTool(TMP);
    await tool.execute({ path: 'edit.ts', content: 'new content' });
    const { readFileSync } = await import('fs');
    expect(readFileSync(join(TMP, 'edit.ts'), 'utf8')).toBe('new content');
  });
});

describe('CreateFileTool', () => {
  it('creates new file', async () => {
    const tool = new CreateFileTool(TMP);
    await tool.execute({ path: 'new.ts', content: 'export {}' });
    expect(existsSync(join(TMP, 'new.ts'))).toBe(true);
  });
});

describe('DeleteFileTool', () => {
  it('deletes file when confirm is true', async () => {
    writeFileSync(join(TMP, 'del.ts'), '');
    const tool = new DeleteFileTool(TMP);
    const result = await tool.execute({ path: 'del.ts', confirm: true });
    expect(existsSync(join(TMP, 'del.ts'))).toBe(false);
    expect(result).toContain('Deleted');
  });

  it('refuses deletion when confirm is not true', async () => {
    writeFileSync(join(TMP, 'safe.ts'), '');
    const tool = new DeleteFileTool(TMP);
    const result = await tool.execute({ path: 'safe.ts', confirm: false });
    expect(existsSync(join(TMP, 'safe.ts'))).toBe(true);
    expect(result).toContain('confirm: true');
  });
});
