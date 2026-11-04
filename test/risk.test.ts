import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyRisk, type FileChange } from '../scripts/risk.js';

const root = join(import.meta.dir, '..');

function change(path: string): FileChange {
  return { path, content: readFileSync(join(root, path), 'utf8') };
}

function runRisk(files: string): { code: number; report: { risky: boolean; reasons: { topic: string; path: string }[] } } {
  const result = Bun.spawnSync(['bun', join(root, 'scripts', 'risk.ts'), '--files', files], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { code: result.exitCode ?? 1, report: JSON.parse(result.stdout.toString()) };
}

describe('classifyRisk', () => {
  test('flags an authentication change', () => {
    const report = classifyRisk([change('src/commands/auth/login.ts')]);
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.topic)).toContain('auth');
  });

  test('flags an entry create change as a data write', () => {
    const report = classifyRisk([change('src/commands/entries/create.ts')]);
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.topic)).toContain('write');
  });

  test('flags an import run change as a data write', () => {
    const report = classifyRisk([change('src/commands/entries/import/run.ts')]);
    expect(report.risky).toBe(true);
    expect(report.reasons.map((reason) => reason.topic)).toContain('write');
  });

  test('flags the shared API client for both authentication and writes', () => {
    const report = classifyRisk([change('src/lib/api.ts')]);
    expect(new Set(report.reasons.map((reason) => reason.topic))).toEqual(new Set(['auth', 'write']));
  });

  test('passes a docs-only change', () => {
    expect(classifyRisk([change('README.md')])).toEqual({ risky: false, reasons: [] });
  });

  test('passes a read-only src change', () => {
    expect(classifyRisk([change('src/commands/entries/list.ts')])).toEqual({ risky: false, reasons: [] });
  });
});

describe('risk CLI', () => {
  test('exits 2 and prints JSON for a risky change', () => {
    const { code, report } = runRisk('src/commands/entries/create.ts');
    expect(code).toBe(2);
    expect(report.risky).toBe(true);
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  test('exits 0 and prints JSON for a safe change', () => {
    const { code, report } = runRisk('README.md');
    expect(code).toBe(0);
    expect(report).toEqual({ risky: false, reasons: [] });
  });
});
