import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planLabelAction } from '../scripts/risk-label.js';
import { run } from './run.js';

const root = join(import.meta.dir, '..');
const fixtures = join(import.meta.dir, 'fixtures', 'risk');

async function withReport(report: string, callback: (path: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-risk-label-'));
  try {
    const path = join(dir, 'report.json');
    writeFileSync(path, report);
    await callback(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runLabel(report: string, labels: string[]): Promise<{ action: string; risky: boolean }> {
  let parsed = { action: '', risky: false };
  await withReport(report, async (path) => {
    const result = await run(
      [
        'bun',
        join(root, 'scripts', 'risk-label.ts'),
        '--report',
        path,
        '--labels',
        JSON.stringify(labels),
        '--json',
      ],
    );
    expect(result.exitCode).toBe(0);
    parsed = JSON.parse(result.stdout);
  });
  return parsed;
}

async function riskReport(name: string): Promise<string> {
  const result = await run(['bun', join(root, 'scripts', 'risk.ts'), '--diff', join(fixtures, `${name}.diff`)]);
  return result.stdout;
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
  test('turns the risk script output for an auth change into an add', async () => {
    expect(await runLabel(await riskReport('auth-behavior'), ['needs-triage'])).toEqual({
      action: 'add',
      risky: true,
    });
  });

  test('turns the risk script output for a write change into an add', async () => {
    expect(await runLabel(await riskReport('write-behavior'), [])).toEqual({
      action: 'add',
      risky: true,
    });
  });

  test('turns the risk script output for a security surface change into an add', async () => {
    expect(await runLabel(await riskReport('security-surfaces'), [])).toEqual({
      action: 'add',
      risky: true,
    });
  });

  test('names the security surface in the summary', async () => {
    let output = '';
    await withReport(await riskReport('security-surfaces'), async (path) => {
      const result = await run(['bun', join(root, 'scripts', 'risk-label.ts'), '--report', path, '--labels', '[]']);
      expect(result.exitCode).toBe(0);
      output = result.stdout;
    });
    expect(output).toContain('`scripts/verify.sh` (security): verification script changed');
    expect(output).toContain('a security surface');
  });

  test('removes the label when the report is safe and the PR still carries it', async () => {
    expect(await runLabel(await riskReport('docs-only'), ['risco', 'documentation'])).toEqual({
      action: 'remove',
      risky: false,
    });
  });

  test('keeps a safe PR without the label untouched', async () => {
    expect(await runLabel(await riskReport('docs-only'), ['documentation'])).toEqual({
      action: 'keep',
      risky: false,
    });
  });
});
