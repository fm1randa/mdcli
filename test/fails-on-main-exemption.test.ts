import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideGate, exemptTitle, parseBodyExemption } from '../scripts/fails-on-main-exemption.js';

const SCRIPT = join(import.meta.dir, '..', 'scripts', 'new-tests-fail-on-main.ts');

describe('exemptTitle', () => {
  test('exempts refactor, test and chore titles, with a scope and a breaking mark', () => {
    expect(exemptTitle('refactor: split module')).toBe('refactor');
    expect(exemptTitle('refactor(lib): split module')).toBe('refactor');
    expect(exemptTitle('test(ci): add the gate proof')).toBe('test');
    expect(exemptTitle('CHORE(deps)!: bump')).toBe('chore');
  });

  test('requires feat, fix and an unrecognized title', () => {
    for (const title of ['feat(ci): exempt', 'fix: correct a value', 'Update the gate', '']) {
      expect(exemptTitle(title)).toBeUndefined();
    }
  });
});

describe('parseBodyExemption', () => {
  test('accepts a reason after a dash or a colon', () => {
    expect(parseBodyExemption('texto\nFails-on-main: isento — refactor puro')).toEqual({
      kind: 'valid',
      reason: 'refactor puro',
    });
    expect(parseBodyExemption('Fails-on-main: isento: sem mudança de comportamento')).toEqual({
      kind: 'valid',
      reason: 'sem mudança de comportamento',
    });
  });

  test('treats a marker without a reason as an invalid exemption', () => {
    expect(parseBodyExemption('Fails-on-main: isento')).toEqual({ kind: 'missing-reason' });
    expect(parseBodyExemption('Fails-on-main: isento —   ')).toEqual({ kind: 'missing-reason' });
  });

  test('ignores a marker inside an HTML comment and a body without one', () => {
    // The PR template arrives as HTML comments; an exemption hidden there is
    // not visible to the reviewer, so it does not count.
    expect(parseBodyExemption('<!-- Fails-on-main: isento — motivo -->')).toEqual({ kind: 'none' });
    expect(parseBodyExemption('## Problema\nnada aqui')).toEqual({ kind: 'none' });
  });
});

describe('decideGate', () => {
  test('does not require the gate when product code did not change', () => {
    expect(decideGate(false, 'feat: change behavior', '')).toEqual({ kind: 'not-required' });
  });

  test('exempts a behavior-preserving title', () => {
    expect(decideGate(true, 'refactor: split module', '')).toEqual({
      kind: 'exempt',
      source: 'title',
      reason: 'the title declares `refactor`, a behavior-preserving change',
    });
  });

  test('accepts a reason declared in the body for a fix PR', () => {
    expect(decideGate(true, 'fix: correct a value', 'Fails-on-main: isento — refactor puro')).toEqual({
      kind: 'exempt',
      source: 'body',
      reason: 'refactor puro',
    });
  });

  test('keeps a fix PR that declares no exemption required', () => {
    expect(decideGate(true, 'fix: correct a value', '## Problema')).toEqual({ kind: 'required' });
    expect(decideGate(true, 'feat(ci): add a gate', '')).toEqual({ kind: 'required' });
  });

  test('rejects a declared exemption without a reason', () => {
    expect(decideGate(true, 'fix: correct a value', 'Fails-on-main: isento')).toEqual({
      kind: 'invalid-exemption',
      reason: 'the body declares `Fails-on-main: isento` without a reason; add one after `—` or `:`',
    });
  });
});

function gitIn(root: string, ...args: string[]): void {
  const result = Bun.spawnSync(
    ['git', '-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' }
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function commit(root: string, message: string): void {
  gitIn(root, 'add', '-A');
  // Keep the temp commit hermetic: a signing or hooks setup in the machine's
  // global git config must not change the suite's result.
  gitIn(root, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', message);
}

/** A temp repo whose head changes src/, with an optional test file that passes on both trees. */
function tempRepo(withTest: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'mdcli-fails-on-main-exemption-'));
  gitIn(root, 'init', '-q');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'bunfig.toml'), '');
  writeFileSync(join(root, 'src', 'program.ts'), 'export const value = 1;\n');
  if (withTest) {
    mkdirSync(join(root, 'test'), { recursive: true });
    writeFileSync(join(root, 'test', 'a.test.ts'), "import { test } from 'bun:test';\ntest('base', () => {});\n");
  }
  commit(root, 'base');

  writeFileSync(join(root, 'src', 'program.ts'), 'export const value = 2;\n');
  if (withTest) {
    writeFileSync(
      join(root, 'test', 'a.test.ts'),
      "import { expect, test } from 'bun:test';\ntest('passes', () => { expect(1).toBe(1); });\n"
    );
  }
  commit(root, 'head');
  return root;
}

interface GateRun {
  exitCode: number;
  stdout: string;
  stderr: string;
  summary: string;
}

function runGate(root: string, env: Record<string, string>): GateRun {
  const summary = join(root, 'summary.md');
  const { PR_TITLE: _title, PR_BODY: _body, GITHUB_STEP_SUMMARY: _summary, ...ambient } = process.env;
  const result = Bun.spawnSync(['bun', SCRIPT, '--base', 'HEAD~1'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...ambient, ...env, GITHUB_STEP_SUMMARY: summary },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    summary: existsSync(summary) ? readFileSync(summary, 'utf8') : '',
  };
}

describe('fails-on-main exemption in CI', () => {
  test('a refactor title skips the gate and says why in the summary', () => {
    const root = tempRepo(false);
    try {
      const run = runGate(root, { PR_TITLE: 'refactor: extract helper' });
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('exempt (title)');
      expect(run.summary).toContain('## fails-on-main: exempt');
      expect(run.summary).toContain('`refactor`');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a reason declared in the body exempts a fix PR', () => {
    const root = tempRepo(false);
    try {
      const run = runGate(root, {
        PR_TITLE: 'fix: correct a value',
        PR_BODY: 'Fails-on-main: isento — refactor puro',
      });
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('exempt (body)');
      expect(run.summary).toContain('declared in the PR body: refactor puro');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a declared exemption without a reason fails and stays visible', () => {
    const root = tempRepo(false);
    try {
      const run = runGate(root, { PR_TITLE: 'fix: correct a value', PR_BODY: 'Fails-on-main: isento' });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('without a reason');
      expect(run.summary).toContain('## fails-on-main: invalid exemption');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a fix PR with a test that passes on main stays rejected', () => {
    const root = tempRepo(true);
    try {
      const run = runGate(root, { PR_TITLE: 'fix: correct a value' });
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain('test/a.test.ts PASSED against HEAD~1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
