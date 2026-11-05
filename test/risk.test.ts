import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyRisk, type RiskReport } from '../scripts/risk.js';

const root = join(import.meta.dir, '..');
const fixtures = join(import.meta.dir, 'fixtures', 'risk');

function diff(name: string): string {
  return readFileSync(join(fixtures, `${name}.diff`), 'utf8');
}

function topics(report: RiskReport): string[] {
  return report.reasons.map((reason) => reason.topic);
}

function runRisk(name: string): { code: number; report: RiskReport } {
  const result = Bun.spawnSync(
    ['bun', join(root, 'scripts', 'risk.ts'), '--diff', join(fixtures, `${name}.diff`)],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return { code: result.exitCode ?? 1, report: JSON.parse(result.stdout.toString()) };
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

describe('security surfaces', () => {
  test('flags a behavior change in the guard, its test, the verify script and the ESLint rules', () => {
    const report = classifyRisk(diff('security-surfaces'));
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.path)).toEqual([
      'scripts/private-terms.ts',
      'test/private-terms.test.ts',
      'scripts/private-terms-corpus.ts',
      'test/private-terms-corpus.test.ts',
      'scripts/verify.sh',
      'eslint-rules/scope-exemptions.json',
    ]);
    expect(topics(report)).toEqual(['security', 'security', 'security', 'security', 'security', 'security']);
    expect(report.reasons.every((reason) => reason.detail.length > 0)).toBe(true);
  });

  test('passes comment-only changes in a security surface', () => {
    expect(classifyRisk(diff('security-comments'))).toEqual({ risky: false, reasons: [] });
  });
});

describe('risk CLI', () => {
  test('exits 0 for a diff that only changes types', () => {
    const { code, report } = runRisk('types-only');
    expect(code).toBe(0);
    expect(report).toEqual({ risky: false, reasons: [] });
  });

  test('exits 2 and prints the reason for a data write change', () => {
    const { code, report } = runRisk('write-behavior');
    expect(code).toBe(2);
    expect(report.risky).toBe(true);
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  test('exits 2 for a change in a security surface', () => {
    const { code, report } = runRisk('security-surfaces');
    expect(code).toBe(2);
    expect(report.risky).toBe(true);
  });
});
