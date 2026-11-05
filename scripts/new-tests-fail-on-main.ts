import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changesBehavior, parseDiff } from './behavior-change.js';

// Issue #186: a test that passes with the fix reverted proves nothing (#155
// admitted exactly that). This runs every new or changed test file against the
// src/ and bin/ of origin/main and requires each one to fail there.

const TEST_FILE = /^test\/.*\.test\.ts$/;

export interface RunResult {
  file: string;
  exitCode: number | null;
  output: string;
}

export interface Verdict {
  ok: boolean;
  passedOnMain: string[];
  infrastructureErrors: string[];
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

/** True when the product diff (src/ or bin/) changes behavior, the only case the gate requires. */
export function changesProduct(productDiff: string): boolean {
  return changesBehavior(parseDiff(productDiff), { includes: (path) => PRODUCT_PATH.test(path) });
}

const INFRASTRUCTURE_ERROR = /# Unhandled error between tests|^[ \t]+[1-9]\d* errors?[ \t]*$/m;

/**
 * A non-zero exit only proves the change when a test failed. A file that did
 * not compile, could not import or crashed the runner left the suite without a
 * comparable result, so it cannot stand in for a failing assertion.
 */
export function classify(result: RunResult): 'passed' | 'failed' | 'infrastructure-error' {
  if (result.exitCode === 0) return 'passed';
  if (result.exitCode === null) return 'infrastructure-error';
  if (INFRASTRUCTURE_ERROR.test(result.output)) return 'infrastructure-error';
  return 'failed';
}

/** The gate passes only when every changed test file fails on main by assertion. */
export function evaluate(results: RunResult[]): Verdict {
  const passedOnMain: string[] = [];
  const infrastructureErrors: string[] = [];
  for (const result of results) {
    const outcome = classify(result);
    if (outcome === 'passed') passedOnMain.push(result.file);
    if (outcome === 'infrastructure-error') infrastructureErrors.push(result.file);
  }
  return { ok: passedOnMain.length === 0 && infrastructureErrors.length === 0, passedOnMain, infrastructureErrors };
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
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      return { file, exitCode: result.exitCode, output };
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
      ['diff', '--no-renames', '--no-color', `${options.base}...HEAD`, '--', 'src', 'bin'],
      root
    );
    if (options.files === undefined && !changesProduct(productDiff)) {
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
    for (const file of verdict.infrastructureErrors) {
      console.error(
        `fails-on-main: ${file} did not compile or run against ${options.base}; a broken run is not a failing assertion.`
      );
    }
    console.error('fails-on-main: add a test that fails on main, or split the test refactor from the fix.');
    process.exitCode = 1;
  } catch (error) {
    console.error(`fails-on-main: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
