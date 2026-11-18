import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { git } from '../scripts/git.js';
import { classifyRisk, type RiskReport } from '../scripts/risk.js';
import { commitAll } from './git-repo.js';
import { run } from './run.js';

const root = join(import.meta.dir, '..');
const fixtures = join(import.meta.dir, 'fixtures', 'risk');
const riskScript = join(root, 'scripts', 'risk.ts');

async function tempRepo(files: Record<string, string>): Promise<{ root: string; rev: string }> {
  const repo = mkdtempSync(join(tmpdir(), 'mdcli-risk-'));
  await git(['init', '-q'], repo);
  for (const [path, content] of Object.entries(files)) {
    const target = join(repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { root: repo, rev: await commitAll(repo, 'base') };
}

const WRITER = [
  "import { apiPost } from '../lib/api.js';",
  '',
  'export function save(payload: unknown): Promise<unknown> {',
  "  return apiPost('/v1/metas/orcamento', payload);",
  '}',
  '',
].join('\n');

function diff(name: string): string {
  return readFileSync(join(fixtures, `${name}.diff`), 'utf8');
}

function topics(report: RiskReport): string[] {
  return report.reasons.map((reason) => reason.topic);
}

async function runRisk(name: string): Promise<{ code: number; report: RiskReport }> {
  const result = await run(['bun', join(root, 'scripts', 'risk.ts'), '--diff', join(fixtures, `${name}.diff`)]);
  return { code: result.exitCode, report: JSON.parse(result.stdout) };
}

describe('classifyRisk', () => {
  test('passes a type-only change in api.ts, captcha.ts and types/api.ts', () => {
    expect(classifyRisk(diff('types-only'))).toEqual({ risky: false, reasons: [] });
  });

  test('passes an output helper change in write commands', () => {
    expect(classifyRisk(diff('output-helper'))).toEqual({ risky: false, reasons: [] });
  });

  test('passes comments in an auth file and test-only changes', () => {
    expect(classifyRisk(diff('comments-and-tests-auth'))).toEqual({ risky: false, reasons: [] });
  });

  test('passes a docs-only change', () => {
    expect(classifyRisk(diff('docs-only'))).toEqual({ risky: false, reasons: [] });
  });

  test('flags a payload field, id or POST/PUT change as a data write', () => {
    const report = classifyRisk(diff('write-behavior'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
  });

  test('flags a new module that calls the write API', () => {
    const report = classifyRisk(diff('new-write-module'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
  });

  test('flags a login or credential change', () => {
    const report = classifyRisk(diff('auth-behavior'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('auth');
  });

  test('flags an unclassified change in a sensitive file', () => {
    const report = classifyRisk(diff('unclassified-sensitive'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('auth');
  });

  test('flags a stdio or encoding change in sync-child.ts', () => {
    expect(classifyRisk(diff('sync-child-stdio'))).toEqual({
      risky: true,
      reasons: [
        {
          topic: 'auth',
          path: 'src/lib/sync-child.ts',
          detail: 'unclassified change in a sensitive file',
        },
      ],
    });
  });

  test('flags a payload change in a combined write command', () => {
    const report = classifyRisk(diff('payload-in-combined-command'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
  });

  test('flags a payload or credential serialized with JSON.stringify', () => {
    const report = classifyRisk(diff('serialized-payload'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
    expect(topics(report)).toContain('auth');
  });

  test('flags a called function changed into a reference', () => {
    const report = classifyRisk(diff('call-vs-reference'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
  });

  test('flags content lines that start with -- or ++', () => {
    const report = classifyRisk(diff('dash-prefixed-content'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('auth');
  });

  test('flags the real #198 diff, which changes a write target', () => {
    const report = classifyRisk(diff('write-target-198'));
    expect(report.risky).toBe(true);
    expect(topics(report)).toContain('write');
  });
});

// One unclassified line, so only the path decides the topic.
function unclassifiedChange(path: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, '@@ -1 +1 @@', '-const value = build();', '+const value = build({});', ''].join('\n');
}

describe('the API client split by resource (#318)', () => {
  test('sees auth and writes in the request core', () => {
    expect(topics(classifyRisk(unclassifiedChange('src/lib/api/request.ts')))).toEqual(['auth', 'write']);
  });

  test('sees writes in every resource module', () => {
    for (const path of ['src/lib/api/registry.ts', 'src/lib/api/entries.ts', 'src/lib/api/bank-import.ts', 'src/lib/api/cards.ts', 'src/lib/api/session.ts']) {
      expect(topics(classifyRisk(unclassifiedChange(path)))).toEqual(['write']);
    }
  });

  test('keeps the barrel and leaves the error helper next to it safe', () => {
    expect(topics(classifyRisk(unclassifiedChange('src/lib/api.ts')))).toEqual(['auth', 'write']);
    expect(classifyRisk(unclassifiedChange('src/lib/api-error.ts'))).toEqual({ risky: false, reasons: [] });
  });
});

describe('security surfaces', () => {
  test('flags a behavior change in the guard, its test, the verify script and the ESLint rules', () => {
    const report = classifyRisk(diff('security-surfaces'));
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.path)).toEqual([
      'scripts/private-terms.ts',
      'scripts/private-terms-hashes.ts',
      'scripts/private-terms-history.ts',
      'test/private-terms.test.ts',
      'scripts/private-terms-corpus.ts',
      'test/private-terms-corpus.test.ts',
      'scripts/verify.sh',
      'eslint-rules/scope-exemptions.json',
    ]);
    expect(topics(report)).toEqual([
      'security',
      'security',
      'security',
      'security',
      'security',
      'security',
      'security',
      'security',
    ]);
    expect(report.reasons.every((reason) => reason.detail.length > 0)).toBe(true);
  });

  test('flags a behavior change in the private-message guard and its test', () => {
    const report = classifyRisk(diff('private-messages-surface'));
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.path)).toEqual([
      'scripts/check-private-messages.ts',
      'test/check-private-messages.test.ts',
    ]);
    expect(report.reasons.every((reason) => reason.detail.length > 0)).toBe(true);
  });

  test('flags a scope change in eslint.config.js, which decides where the local rules run', () => {
    // Dropping scripts/** from a block silenced the rule there without touching eslint-rules/ (#272).
    expect(classifyRisk(diff('eslint-config-surface'))).toEqual({
      risky: true,
      reasons: [{ topic: 'security', path: 'eslint.config.js', detail: 'ESLint config that scopes the local rules changed' }],
    });
  });

  test('passes comment-only changes in a security surface', () => {
    expect(classifyRisk(diff('security-comments'))).toEqual({ risky: false, reasons: [] });
  });

  test('flags a change in the gate scripts and workflows as security', () => {
    const report = classifyRisk(diff('gate-surfaces'));
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.path)).toEqual([
      'scripts/risk.ts',
      'scripts/risk-label.ts',
      'scripts/new-tests-fail-on-main.ts',
      'scripts/fails-on-main-exemption.ts',
      'scripts/prova.ts',
      '.github/workflows/risco.yml',
      '.github/workflows/fails-on-main.yml',
    ]);
    expect(topics(report)).toEqual([
      'security',
      'security',
      'security',
      'security',
      'security',
      'security',
      'security',
    ]);
    expect(report.reasons.every((reason) => reason.detail.length > 0)).toBe(true);
  });
});

describe('risk CLI', () => {
  test('exits 0 for a diff that only changes types', async () => {
    const { code, report } = await runRisk('types-only');
    expect(code).toBe(0);
    expect(report).toEqual({ risky: false, reasons: [] });
  });

  test('exits 2 and prints the reason for a data write change', async () => {
    const { code, report } = await runRisk('write-behavior');
    expect(code).toBe(2);
    expect(report.risky).toBe(true);
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  test('exits 2 for a change in a security surface', async () => {
    const { code, report } = await runRisk('security-surfaces');
    expect(code).toBe(2);
    expect(report.risky).toBe(true);
  });

  test('exits 2 for a behavior change in a module that calls the write API', async () => {
    // budget-write.ts calls apiPost and its name is not in WRITE_PATH (#315).
    const { code, report } = await runRisk('budget-write-behavior');
    expect(code).toBe(2);
    expect(topics(report)).toContain('write');
  });

  test('finds the write module when the gate runs from a subdirectory', async () => {
    const repo = await tempRepo({ 'src/commands/budget-write.ts': WRITER });
    try {
      const result = await run(
        ['bun', riskScript, '--base', repo.rev, '--diff', join(fixtures, 'budget-write-behavior.diff')],
        { cwd: join(repo.root, 'src', 'commands') }
      );
      expect(result.exitCode).toBe(2);
      expect(topics(JSON.parse(result.stdout) as RiskReport)).toContain('write');
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('flags a file that called the write API at the base after the call moves away', async () => {
    const repo = await tempRepo({ 'src/commands/budget-write.ts': WRITER });
    try {
      writeFileSync(join(repo.root, 'src', 'commands', 'budget-write.ts'), 'export const value = 1;\n');
      await commitAll(repo.root, 'move the write away');
      const result = await run(
        ['bun', riskScript, '--base', repo.rev, '--diff', join(fixtures, 'budget-write-behavior.diff')],
        { cwd: repo.root }
      );
      expect(result.exitCode).toBe(2);
      expect(topics(JSON.parse(result.stdout) as RiskReport)).toContain('write');
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });

  test('fails instead of reporting safe when the base does not resolve', async () => {
    const result = await run(['bun', riskScript, '--base', 'mian', '--diff', join(fixtures, 'budget-write-behavior.diff')]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('mian');
  });

  test('classifies a --diff run without origin/main and warns', async () => {
    const repo = await tempRepo({ 'src/commands/budget-write.ts': WRITER });
    try {
      const result = await run(['bun', riskScript, '--diff', join(fixtures, 'budget-write-behavior.diff')], {
        cwd: repo.root,
      });
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('origin/main');
      expect(topics(JSON.parse(result.stdout) as RiskReport)).toContain('write');
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });
});
