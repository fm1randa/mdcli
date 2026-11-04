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
});
