import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;

export type ShikiTheme = 'github-dark' | 'github-light' | 'nord' | 'dracula' | 'one-dark-pro' | 'vitesse-dark';

export const SHIKI_THEMES: ShikiTheme[] = [
  'github-dark', 'github-light', 'nord', 'dracula', 'one-dark-pro', 'vitesse-dark'
];

const SUPPORTED_LANGS = [
  'typescript', 'javascript', 'tsx', 'jsx', 'python', 'rust', 'go',
  'bash', 'sh', 'json', 'yaml', 'toml', 'sql', 'html', 'css', 'markdown', 'plaintext'
];

export async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (initPromise) return initPromise;
  initPromise = createHighlighter({
    themes: SHIKI_THEMES,
    langs: SUPPORTED_LANGS,
  }).then(h => { highlighter = h; return h; });
  return initPromise;
}

export async function highlight(code: string, lang: string, theme: ShikiTheme = 'github-dark'): Promise<string> {
  const h = await getHighlighter();
  const resolvedLang = SUPPORTED_LANGS.includes(lang) ? lang : 'plaintext';
  return h.codeToHtml(code, { lang: resolvedLang, theme });
}
