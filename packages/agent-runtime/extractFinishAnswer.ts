/**
 * Recover agent "finish" payloads when small models emit invalid JSON
 * (unescaped quotes/newlines inside args.answer, prose before `{`, etc.).
 */

export interface ParsedFinishCall {
  thought: string;
  tool: 'finish';
  args: { answer: string };
}

function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*(\}|\])/g, '$1');
}

/** If the model wrapped JSON in a markdown fence, return inner text. */
function unwrapOuterMarkdownFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im);
  return m ? m[1].trim() : t;
}

function proseBeforeFirstBrace(text: string): string {
  const i = text.indexOf('{');
  if (i <= 0) return text;
  return text.slice(i).trim();
}

/**
 * Models often put literal backslash-n in `args.answer` (double-escaped or pasted tool output).
 * JSON.parse then yields visible `\n` in the UI; normalize to real newlines for markdown.
 */
export function decodeLiteralEscapeSequencesInAnswer(text: string): string {
  if (!text || !/\\[nrt"\\]/.test(text)) return text;
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Scan "answer": "…" where inner quotes may be invalid JSON; end the string at the first
 * `"` whose remainder looks like closing `}` / `}}` for the agent envelope.
 */
export function tryExtractFinishToolCall(content: string): ParsedFinishCall | null {
  const trimmed = unwrapOuterMarkdownFence(content.trim());
  if (!/"tool"\s*:\s*"finish"/i.test(trimmed)) return null;

  const body = proseBeforeFirstBrace(trimmed);
  const m = body.match(/"answer"\s*:\s*"/i);
  if (!m || m.index === undefined) return null;

  let i = m.index + m[0].length;
  let out = '';

  const restLooksLikeEndOfAnswer = (rest: string): boolean => {
    const s = rest.trimStart();
    if (/^\}\s*\}\s*$/.test(s)) return true;
    if (/^\}\s*\}\s*,?\s*$/.test(s)) return true;
    if (/^\}\s*$/.test(s)) return true;
    if (/^\}\s*,\s*"\s*\}\s*$/.test(s)) return false;
    return /^\}\s*,?\s*$/.test(s);
  };

  while (i < body.length) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) {
      const n = body[i + 1];
      if (n === 'n') {
        out += '\n';
        i += 2;
        continue;
      }
      if (n === 'r') {
        out += '\r';
        i += 2;
        continue;
      }
      if (n === 't') {
        out += '\t';
        i += 2;
        continue;
      }
      if (n === '"' || n === '\\') {
        out += n;
        i += 2;
        continue;
      }
      out += n;
      i += 2;
      continue;
    }
    if (c === '"') {
      const rest = body.slice(i + 1);
      if (restLooksLikeEndOfAnswer(rest)) {
        return { thought: '', tool: 'finish', args: { answer: out } };
      }
    }
    out += c;
    i++;
  }

  if (out.length > 0) {
    return { thought: '', tool: 'finish', args: { answer: out.trimEnd() } };
  }
  return null;
}

/** Prefer strict JSON, then loose finish extraction — for chat UI and recovery parsing. */
export function formatAssistantAgentOutput(raw: string): string {
  const once = unwrapOuterMarkdownFence(raw.trim());
  const candidate = once.includes('{') ? proseBeforeFirstBrace(once) : once;

  let body = raw;

  try {
    const parsed = JSON.parse(stripTrailingCommas(candidate));
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.tool === 'finish' &&
      typeof (parsed as { args?: { answer?: unknown } }).args?.answer === 'string'
    ) {
      body = (parsed as { args: { answer: string } }).args.answer;
    } else {
      const loose = tryExtractFinishToolCall(raw);
      if (loose) body = loose.args.answer;
    }
  } catch {
    const loose = tryExtractFinishToolCall(raw);
    if (loose) body = loose.args.answer;
  }

  return decodeLiteralEscapeSequencesInAnswer(body);
}

/** Extract JSON `thought` from a single-turn agent finish object (for display when tags are missing). */
export function extractAgentFinishThought(raw: string): string | null {
  const once = unwrapOuterMarkdownFence(raw.trim());
  const candidate = once.includes('{') ? proseBeforeFirstBrace(once) : once;
  try {
    const parsed = JSON.parse(stripTrailingCommas(candidate)) as {
      tool?: string;
      thought?: unknown;
    };
    if (parsed?.tool === 'finish' && typeof parsed.thought === 'string') {
      const t = parsed.thought.trim();
      return t.length > 0 ? t : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** True when the bubble should run agent-style formatting (avoid double-processing normal chat). */
export function looksLikeAgentEnvelope(text: string): boolean {
  const t = text.trim();
  if (!t.includes('"tool"')) return false;
  return /"tool"\s*:\s*"(?:finish|[a-z_]+)"/i.test(t) || t.startsWith('{');
}
