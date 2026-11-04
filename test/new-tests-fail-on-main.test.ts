import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { changedTestFiles, evaluate } from '../scripts/new-tests-fail-on-main.js';

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

describe('evaluate', () => {
  test('passes when every changed test fails on main', () => {
    expect(evaluate([{ file: 'test/a.test.ts', exitCode: 1 }])).toEqual({ ok: true, passedOnMain: [] });
    expect(evaluate([])).toEqual({ ok: true, passedOnMain: [] });
  });

  test('fails and names a test that passes on main', () => {
    expect(evaluate([{ file: 'test/a.test.ts', exitCode: 0 }, { file: 'test/b.test.ts', exitCode: 1 }])).toEqual({
      ok: false,
      passedOnMain: ['test/a.test.ts'],
    });
  });
});

describe('fails-on-main CLI', () => {
  const script = join(import.meta.dir, '..', 'scripts', 'new-tests-fail-on-main.ts');

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
});
