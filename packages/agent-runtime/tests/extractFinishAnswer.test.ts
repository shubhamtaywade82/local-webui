import { describe, it, expect } from 'vitest';
import {
  tryExtractFinishToolCall,
  formatAssistantAgentOutput,
  extractAgentFinishThought,
} from '../extractFinishAnswer';

describe('tryExtractFinishToolCall', () => {
  it('parses strict JSON finish', () => {
    const raw = JSON.stringify({
      thought: 't',
      tool: 'finish',
      args: { answer: 'Hello **world**' },
    });
    const r = tryExtractFinishToolCall(raw);
    expect(r?.args.answer).toBe('Hello **world**');
  });

  it('recovers answer when JSON is invalid due to unescaped inner quotes', () => {
    const raw = `Some prose before.
{"thought":"x","tool":"finish","args":{"answer":"He said "hi" and left"}}`;
    const r = tryExtractFinishToolCall(raw);
    expect(r).not.toBeNull();
    expect(r!.args.answer).toContain('He said');
  });

  it('recovers multiline answer without JSON escapes before closing braces', () => {
    const raw = `{"tool":"finish","args":{"answer":"Line1
Line2
Line3"}}`;
    const r = tryExtractFinishToolCall(raw);
    expect(r?.args.answer).toContain('Line1');
    expect(r?.args.answer).toContain('Line3');
  });
});

describe('extractAgentFinishThought', () => {
  it('returns thought from strict finish JSON', () => {
    const s = JSON.stringify({
      thought: 'Step 1: verify symbol',
      tool: 'finish',
      args: { answer: 'Done' },
    });
    expect(extractAgentFinishThought(s)).toBe('Step 1: verify symbol');
  });

  it('returns null when thought missing', () => {
    const s = JSON.stringify({ tool: 'finish', args: { answer: 'Only answer' } });
    expect(extractAgentFinishThought(s)).toBeNull();
  });
});

describe('formatAssistantAgentOutput', () => {
  it('returns answer from valid finish JSON', () => {
    const s = JSON.stringify({ tool: 'finish', args: { answer: '# Title\nBody' } });
    expect(formatAssistantAgentOutput(s)).toBe('# Title\nBody');
  });

  it('turns literal backslash-n sequences into real newlines', () => {
    const s = JSON.stringify({ tool: 'finish', args: { answer: 'A\\n\\nB' } });
    expect(formatAssistantAgentOutput(s)).toBe('A\n\nB');
  });

  it('strips preamble before JSON object', () => {
    const inner = `{"tool":"finish","args":{"answer":"OK"}}`;
    expect(formatAssistantAgentOutput(`Sorry.\n\n${inner}`)).toBe('OK');
  });
});
