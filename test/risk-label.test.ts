import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planLabelAction } from '../scripts/risk-label.js';

const root = join(import.meta.dir, '..');

function withReport(report: string, callback: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-risk-label-'));
  try {
    const path = join(dir, 'report.json');
    writeFileSync(path, report);
    callback(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runLabel(report: string, labels: string[]): { action: string; risky: boolean } {
  let parsed = { action: '', risky: false };
  withReport(report, (path) => {
    const result = Bun.spawnSync(
      [
        'bun',
        join(root, 'scripts', 'risk-label.ts'),
        '--report',
        path,
        '--labels',
        JSON.stringify(labels),
        '--json',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(result.exitCode).toBe(0);
    parsed = JSON.parse(result.stdout.toString());
  });
  return parsed;
}

function riskReport(files: string): string {
  const result = Bun.spawnSync(['bun', join(root, 'scripts', 'risk.ts'), '--files', files], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return result.stdout.toString();
}

describe('planLabelAction', () => {
  test('adds the label to a risky PR that does not carry it', () => {
    expect(planLabelAction(true, ['bug', 'enhancement'])).toBe('add');
  });

  test('keeps the label on a risky PR that already carries it', () => {
    expect(planLabelAction(true, ['risco'])).toBe('keep');
  });

  test('removes the label when a push leaves the PR safe', () => {
    expect(planLabelAction(false, ['bug', 'risco'])).toBe('remove');
  });

  test('leaves a safe PR without the label untouched', () => {
    expect(planLabelAction(false, ['bug'])).toBe('keep');
  });
});

describe('risk-label CLI', () => {
  test('turns the risk script output for an auth change into an add', () => {
    expect(runLabel(riskReport('src/commands/auth/login.ts'), ['needs-triage'])).toEqual({
      action: 'add',
      risky: true,
    });
  });

  test('turns the risk script output for a write change into an add', () => {
    expect(runLabel(riskReport('src/commands/entries/create.ts'), [])).toEqual({
      action: 'add',
      risky: true,
    });
  });

  test('removes the label when the report is safe and the PR still carries it', () => {
    expect(runLabel(riskReport('README.md'), ['risco', 'documentation'])).toEqual({
      action: 'remove',
      risky: false,
    });
  });

  test('keeps a safe PR without the label untouched', () => {
    expect(runLabel(riskReport('README.md'), ['documentation'])).toEqual({
      action: 'keep',
      risky: false,
    });
  });
});
