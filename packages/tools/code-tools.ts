import { spawnSync, execSync } from 'child_process';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BaseTool, ToolSchema } from './types';

const SUPPORTED_LANGUAGES: Record<string, { image: string; ext: string; cmd: string }> = {
  javascript: { image: 'node:20-alpine', ext: 'js', cmd: 'node /code/run.js' },
  typescript: { image: 'node:20-alpine', ext: 'ts', cmd: 'npx --yes tsx /code/run.ts' },
  python: { image: 'python:3.12-alpine', ext: 'py', cmd: 'python /code/run.py' },
};

export class RunCodeTool extends BaseTool {
  readonly name = 'run_code';
  readonly description = 'Execute code in an isolated Docker sandbox (network-blocked, 30s timeout)';
  readonly schema: ToolSchema = {
    name: 'run_code',
    description: 'Run code in Docker sandbox',
    args: {
      language: { type: 'string', description: 'javascript | typescript | python', required: true },
      code: { type: 'string', description: 'Code to execute', required: true }
    }
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const language = String(args.language).toLowerCase();
    const lang = SUPPORTED_LANGUAGES[language];
    if (!lang) {
      return `Error: Unsupported language "${language}". Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`;
    }

    const tmpDir = join(tmpdir(), `agent-code-${Date.now()}`);
    const codeFile = join(tmpDir, `run.${lang.ext}`);

    try {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(codeFile, String(args.code), 'utf8');

      const result = spawnSync('docker', [
        'run', '--rm',
        '--network', 'none',
        '--memory', '256m',
        '--cpus', '0.5',
        '--ulimit', 'nofile=64:64',
        '-v', `${tmpDir}:/code:ro`,
        lang.image,
        'sh', '-c', lang.cmd
      ], { timeout: 30000, encoding: 'utf8' });

      const stdout = (result.stdout || '').slice(0, 10240);
      const stderr = (result.stderr || '').slice(0, 2048);

      if (result.error) return `Execution error: ${result.error.message}`;
      if (result.status !== 0) return `Exit code ${result.status}\n${stderr || stdout}`;
      return stdout || '(no output)';
    } catch (e) {
      return `Execution error: ${(e as Error).message}`;
    } finally {
      try { unlinkSync(codeFile); } catch {}
      try { execSync(`rm -rf "${tmpDir}"`, { timeout: 5000 }); } catch {}
    }
  }
}
