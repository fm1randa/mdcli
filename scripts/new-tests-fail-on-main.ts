import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Issue #186: a test that passes with the fix reverted proves nothing (#155
// admitted exactly that). This runs every new or changed test file against the
// src/ and bin/ of origin/main and requires each one to fail there.

const TEST_FILE = /^test\/.*\.test\.ts$/;

export interface RunResult {
  file: string;
  exitCode: number;
}

export interface Verdict {
  ok: boolean;
  passedOnMain: string[];
}

/** The added or modified test files in `git diff --name-status` output. */
export function changedTestFiles(nameStatus: string): string[] {
  const files: string[] = [];
  for (const line of nameStatus.split('\n')) {
    const [status, path] = line.split('\t');
    if (path === undefined) continue;
    if ((status === 'A' || status === 'M') && TEST_FILE.test(path)) files.push(path);
  }
  return files;
}

const PRODUCT_PATH = /^(?:src|bin)(?:\/|$)/;
const COMMENT_LINE = /^(?:\/\/|\/\*|\*)/;

/** True when the diff changes product code (src/ or bin/), the only case the gate requires. */
export function changesProduct(nameStatus: string, productDiff: string): boolean {
  const touchesProduct = nameStatus.split('\n').some((line) => {
    const fields = line.split('\t');
    return PRODUCT_PATH.test(fields[fields.length - 1] ?? '');
  });
  if (!touchesProduct) return false;
  return productDiff.split('\n').some((line) => {
    // Headers carry no content; an empty line and a comment are not behavior.
    if (!line.startsWith('+') && !line.startsWith('-')) return false;
    if (line.startsWith('+++ ') || line.startsWith('--- ')) return false;
    const content = line.slice(1).trim();
    return content !== '' && !COMMENT_LINE.test(content);
  });
}

/** The gate passes only when every changed test file fails against main. */
export function evaluate(results: RunResult[]): Verdict {
  const passedOnMain = results.filter((result) => result.exitCode === 0).map((result) => result.file);
  return { ok: passedOnMain.length === 0, passedOnMain };
}

interface Options {
  base: string;
  files?: string[];
}

function parseOptions(argv: string[]): Options {
  const options: Options = { base: 'origin/main' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') {
      options.base = argv[++index] ?? options.base;
    } else if (arg === '--files') {
      options.files = (argv[++index] ?? '').split(',').filter((file) => file !== '');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(args: string[], cwd: string): string {
  const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function repoRoot(): string {
  return git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
}

function runTests(root: string, base: string, files: string[]): RunResult[] {
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-fails-on-main-'));
  const worktree = join(dir, 'worktree');
  try {
    git(['worktree', 'add', '--detach', worktree, base], root);
    // The branch's tests run against main's product code: replace the test
    // directory (helpers, fixtures, setup) and keep src/, bin/ and scripts/.
    rmSync(join(worktree, 'test'), { recursive: true, force: true });
    cpSync(join(root, 'test'), join(worktree, 'test'), { recursive: true });
    cpSync(join(root, 'bunfig.toml'), join(worktree, 'bunfig.toml'));
    symlinkSync(join(root, 'node_modules'), join(worktree, 'node_modules'), 'dir');

    return files.map((file) => {
      const result = Bun.spawnSync(['bun', 'test', `./${file}`, '--timeout', '20000'], {
        cwd: worktree,
        stdout: 'inherit',
        stderr: 'inherit',
      });
      return { file, exitCode: result.exitCode ?? 1 };
    });
  } finally {
    try {
      if (existsSync(worktree)) git(['worktree', 'remove', '--force', worktree], root);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const root = repoRoot();
    const diff = git(['diff', '--name-status', '--no-renames', `${options.base}...HEAD`], root);
    // A test-only PR (like this gate's own fix to a flawed guard) has no new
    // behavior to prove, and a comment in src/ is not behavior either; the gate
    // only guards PRs that change product code.
    const productDiff = git(
      ['diff', '-U0', '--no-renames', `${options.base}...HEAD`, '--', 'src', 'bin'],
      root
    );
    if (options.files === undefined && !changesProduct(diff, productDiff)) {
      console.log('fails-on-main: not required (no src/ or bin/ code change)');
      return;
    }
    const files = options.files ?? changedTestFiles(diff);

    if (files.length === 0) {
      console.log('fails-on-main: no new or changed test file');
      return;
    }

    console.log(`fails-on-main: running against ${options.base}: ${files.join(', ')}`);
    const verdict = evaluate(runTests(root, options.base, files));
    if (verdict.ok) {
      console.log('fails-on-main: every changed test failed against main (good)');
      return;
    }

    for (const file of verdict.passedOnMain) {
      console.error(`fails-on-main: ${file} PASSED against ${options.base}; it cannot prove the change.`);
    }
    console.error('fails-on-main: add a test that fails on main, or split the test refactor from the fix.');
    process.exitCode = 1;
  } catch (error) {
    console.error(`fails-on-main: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
