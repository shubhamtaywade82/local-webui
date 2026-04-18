import { describe, it, expect } from 'vitest';
import {
  humanizeToolRunning,
  humanizeToolDone,
  humanizePendingStepLabel
} from '../humanizeAgentActivity';

describe('humanizeAgentActivity', () => {
  it('describes list_files with directory context', () => {
    expect(humanizeToolRunning('list_files', { path: 'apps/web' })).toContain('apps/web');
    expect(humanizeToolRunning('list_files', { path: '.' })).toContain('workspace root');
    expect(humanizeToolDone('list_files', { path: 'src' })).toContain('src');
  });

  it('describes read_file with path', () => {
    expect(humanizeToolRunning('read_file', { path: 'README.md' })).toContain('README.md');
    expect(humanizeToolDone('read_file', { path: 'README.md' })).toContain('README.md');
  });

  it('includes search query preview for search_kb', () => {
    const run = humanizeToolRunning('search_kb', { query: 'options strategies' });
    expect(run).toContain('options strategies');
    expect(humanizeToolDone('search_kb', { query: 'options strategies' })).toContain('options');
  });

  it('pending label describes the upcoming action without ellipsis', () => {
    const label = humanizePendingStepLabel('list_files', { path: 'packages' });
    expect(label).toContain('packages');
    expect(label.endsWith('…')).toBe(false);
  });
});
