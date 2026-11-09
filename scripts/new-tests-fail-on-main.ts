import { appendFileSync, cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changesBehavior, parseDiff } from './behavior-change.js';
import { diffAgainst, git, parseBase, repoRoot, spawn } from './git.js';
import { parseInteger } from '../src/utils/parse.js';
import { decideGate, exemptionSummary, invalidExemptionSummary } from './fails-on-main-exemption.js';

// Issue #186: a test that passes with the fix reverted proves nothing (#155
// admitted exactly that). This runs every new or changed test file against the
// src/ and bin/ of origin/main and requires each one to fail there. Issue #235:
// a single red run under load proved nothing in the #200 proof, so each test
// runs several times and the gate accepts only when every run fails.

const TEST_FILE = /^test\/.*\.test\.ts$/;
const DEFAULT_REPEAT = 3;

export interface RunResult {
  file: string;
  run: number;
  repeat: number;
  exitCode: number | null;
  output: string;
}

export interface Verdict {
  ok: boolean;
  passedOnMain: RunResult[];
  infrastructureErrors: RunResult[];
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

/** The gate passes only when every run of every changed test fails on main by assertion. */
export function evaluate(results: RunResult[]): Verdict {
  const passedOnMain = results.filter((result) => classify(result) === 'passed');
  const infrastructureErrors = results.filter((result) => classify(result) === 'infrastructure-error');
  return { ok: passedOnMain.length === 0 && infrastructureErrors.length === 0, passedOnMain, infrastructureErrors };
}

interface Options {
  base: string;
  repeat: number;
  files?: string[];
}

function parseOptions(argv: string[]): Options {
  const { base, rest } = parseBase(argv);
  const options: Options = { base, repeat: DEFAULT_REPEAT };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg === '--files') {
      options.files = (rest[++index] ?? '').split(',').filter((file) => file !== '');
    } else if (arg === '--repeat') {
      const repeat = parseInteger(rest[++index] ?? '', 1);
      if (repeat === undefined) throw new Error('--repeat needs a whole number of at least 1');
      options.repeat = repeat;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function runTests(root: string, base: string, files: string[], repeat: number): RunResult[] {
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

    const results: RunResult[] = [];
    for (const file of files) {
      for (let run = 1; run <= repeat; run++) {
        console.log(`fails-on-main: ${file} run ${run} of ${repeat}`);
        const result = spawn(['bun', 'test', `./${file}`, '--timeout', '20000'], { cwd: worktree });
        const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        results.push({ file, run, repeat, exitCode: result.exitCode, output });
      }
    }
    return results;
  } finally {
    try {
      if (existsSync(worktree)) git(['worktree', 'remove', '--force', worktree], root);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function writeSummary(markdown: string): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    appendFileSync(path, `${markdown}\n\n`);
  } catch (error) {
    console.error(`fails-on-main: could not write the step summary: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function main(): void {
  try {
    const options = parseOptions(process.argv.slice(2));
    const root = repoRoot();
    const diff = diffAgainst(options.base, { flags: ['--name-status'], cwd: root });
    // A test-only PR (like this gate's own fix to a flawed guard) has no new
    // behavior to prove, and a comment in src/ is not behavior either; the gate
    // only guards PRs that change product code.
    const productDiff = diffAgainst(options.base, { paths: ['src', 'bin'], cwd: root });
    // A `--files` run is the manual proof from the PR: it always runs, so an
    // exemption never hides a proof the author asked for.
    if (options.files === undefined) {
      const decision = decideGate(
        changesProduct(productDiff),
        process.env.PR_TITLE ?? '',
        process.env.PR_BODY ?? ''
      );
      if (decision.kind === 'not-required') {
        console.log('fails-on-main: not required (no src/ or bin/ code change)');
        return;
      }
      if (decision.kind === 'exempt') {
        console.log(`fails-on-main: exempt (${decision.source}): ${decision.reason}`);
        writeSummary(exemptionSummary(decision.source, decision.reason));
        return;
      }
      if (decision.kind === 'invalid-exemption') {
        console.error(`fails-on-main: ${decision.reason}`);
        writeSummary(invalidExemptionSummary(decision.reason));
        process.exitCode = 1;
        return;
      }
    }
    const files = options.files ?? changedTestFiles(diff);

    if (files.length === 0) {
      console.log('fails-on-main: no new or changed test file');
      return;
    }

    console.log(`fails-on-main: running against ${options.base} ${options.repeat} times: ${files.join(', ')}`);
    const verdict = evaluate(runTests(root, options.base, files, options.repeat));
    if (verdict.ok) {
      console.log('fails-on-main: every changed test failed against main in every run (good)');
      return;
    }

    for (const result of verdict.passedOnMain) {
      console.error(
        `fails-on-main: ${result.file} PASSED against ${options.base} on run ${result.run} of ${result.repeat}; it cannot prove the change.`
      );
    }
    for (const result of verdict.infrastructureErrors) {
      console.error(
        `fails-on-main: ${result.file} did not compile or run against ${options.base} on run ${result.run} of ${result.repeat}; a broken run is not a failing assertion.`
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