import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { changedTestFiles, changesProduct, classify, evaluate } from '../scripts/new-tests-fail-on-main.js';
import type { RunResult } from '../scripts/new-tests-fail-on-main.js';

const result = (
  exitCode: number | null,
  output: string,
  file = 'test/a.test.ts',
  run = 1,
  repeat = 1
): RunResult => ({ file, run, repeat, exitCode, output });

describe('changedTestFiles', () => {
  test('keeps added and modified test files', () => {
    const diff = ['A\ttest/new.test.ts', 'M\ttest/changed.test.ts', 'A\ttest/helpers.ts', 'M\tsrc/program.ts', 'D\ttest/old.test.ts'].join('\n');
    expect(changedTestFiles(diff)).toEqual(['test/new.test.ts', 'test/changed.test.ts']);
  });

  test('ignores deletions, non-test files and an empty diff', () => {
    expect(changedTestFiles('')).toEqual([]);
    expect(changedTestFiles('D\ttest/gone.test.ts')).toEqual([]);
    expect(changedTestFiles('M\ttest/fixtures.ts')).toEqual([]);
  });
});

describe('changesProduct', () => {
  test('requires a src/ or bin/ code change', () => {
    expect(changesProduct('M\tsrc/program.ts', '+export const value = 1;\n-export const value = 2;')).toBe(true);
    expect(changesProduct('A\tbin/cli.ts', '--- /dev/null\n+++ b/bin/cli.ts\n+#!/usr/bin/env bun')).toBe(true);
    expect(changesProduct('D\tsrc/lib/api.ts', '-export function call() {}')).toBe(true);
    // An added source line that itself starts with ++ is content, not a header.
    expect(changesProduct('M\tsrc/program.ts', '+++i;')).toBe(true);
  });

  test('does not require a comment-only src/ change', () => {
    expect(changesProduct('M\tsrc/program.ts', '-// old note\n+// new note')).toBe(false);
    expect(changesProduct('M\tsrc/lib/api.ts', '-/** old */\n+/** new */')).toBe(false);
  });

  test('requires the gate for a line that only looks like a comment', () => {
    // `* 2;` continues an expression, and template literals can start a line
    // with any character. Both are behavior, so they fail to the safe side.
    expect(changesProduct('M\tsrc/program.ts', '+  * 2;')).toBe(true);
    expect(changesProduct('M\tsrc/program.ts', '+const message = `\n+ * still template text\n+`;')).toBe(true);
    expect(changesProduct('M\tsrc/program.ts', '+/* incomplete block\n+ * body')).toBe(true);
  });

  test('does not require a test-only, lint or docs change', () => {
    expect(changesProduct('M\ttest/a.test.ts', '+// note')).toBe(false);
    expect(changesProduct('M\teslint-rules/no-raw-dash.js', '+const rule = 1;')).toBe(false);
    expect(changesProduct('M\tAGENTS.md', '+// note')).toBe(false);
    expect(changesProduct('', '')).toBe(false);
  });
});

const FAILED = '1 fail\n1 expect() calls\nRan 1 test across 1 file.';
const UNHANDLED = '# Unhandled error between tests\n1 fail\n1 error\nRan 1 test across 1 file.';

describe('classify', () => {
  test('a zero exit passed on main', () => {
    expect(classify(result(0, '1 pass'))).toBe('passed');
  });

  test('a test assertion failure is proof', () => {
    expect(classify(result(1, FAILED))).toBe('failed');
    expect(classify(result(1, 'Expected: 2\nReceived: 1'))).toBe('failed');
  });

  test('a compile, import or runner error is not proof', () => {
    expect(classify(result(1, UNHANDLED))).toBe('infrastructure-error');
    expect(classify(result(1, '1 fail\n 2 errors\nRan 2 tests'))).toBe('infrastructure-error');
    expect(classify(result(null, ''))).toBe('infrastructure-error');
  });
});

describe('evaluate', () => {
  test('passes when every run of every changed test fails on main by assertion', () => {
    expect(
      evaluate([
        result(1, FAILED, 'test/a.test.ts', 1, 3),
        result(1, FAILED, 'test/a.test.ts', 2, 3),
        result(1, FAILED, 'test/a.test.ts', 3, 3),
      ])
    ).toEqual({ ok: true, passedOnMain: [], infrastructureErrors: [] });
    expect(evaluate([])).toEqual({ ok: true, passedOnMain: [], infrastructureErrors: [] });
  });

  test('fails and names the run that passed on main', () => {
    const passed = result(0, '', 'test/a.test.ts', 2, 3);
    expect(
      evaluate([
        result(1, FAILED, 'test/a.test.ts', 1, 3),
        passed,
        result(1, FAILED, 'test/a.test.ts', 3, 3),
      ])
    ).toEqual({ ok: false, passedOnMain: [passed], infrastructureErrors: [] });
  });

  test('fails and names the run that broke against main', () => {
    const verdict = evaluate([
      result(1, FAILED, 'test/a.test.ts', 1, 3),
      result(1, UNHANDLED, 'test/b.test.ts', 2, 3),
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.passedOnMain).toEqual([]);
    // Keep the fixture out of the failure diff: the gate reads this output to
    // tell an assertion from a broken run, and an echoed fixture would fake one.
    expect(verdict.infrastructureErrors.map((error) => error.file)).toEqual(['test/b.test.ts']);
    expect(verdict.infrastructureErrors.map((error) => error.run)).toEqual([2]);
  });
});

describe('fails-on-main CLI', () => {
  const script = join(import.meta.dir, '..', 'scripts', 'new-tests-fail-on-main.ts');

  test('is not required when the diff has no src/ or bin/ change', () => {
    const result = Bun.spawnSync(['bun', script, '--base', 'HEAD'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('not required (no src/ or bin/ code change)');
  });

  test('rejects a test that passes against the same tree', () => {
    // --base HEAD means the worktree has this branch's product code, so the
    // test passes there and the gate must report it.
    const result = Bun.spawnSync(['bun', script, '--base', 'HEAD', '--files', 'test/dates.test.ts'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('test/dates.test.ts PASSED against HEAD');
  });

  test('repeats the test three times and names every run that passed', () => {
    const result = Bun.spawnSync(['bun', script, '--base', 'HEAD', '--files', 'test/dates.test.ts'], {
      cwd: join(import.meta.dir, '..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(1);
    const stderr = result.stderr.toString();
    for (const run of [1, 2, 3]) {
      expect(stderr).toContain(`test/dates.test.ts PASSED against HEAD on run ${run} of 3`);
    }
  });

  test('--repeat sets the number of runs', () => {
    const result = Bun.spawnSync(
      ['bun', script, '--base', 'HEAD', '--files', 'test/dates.test.ts', '--repeat', '2'],
      {
        cwd: join(import.meta.dir, '..'),
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('test/dates.test.ts PASSED against HEAD on run 2 of 2');
    expect(result.stderr.toString()).not.toContain('on run 3 of 2');
  });
});
