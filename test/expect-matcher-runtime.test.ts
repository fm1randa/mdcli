import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Unawaited expect().resolves and expect().rejects are safe only while they
// block. test/private-terms.test.ts calls rejects inside withRepo, and that
// helper deletes the repo in finally. Proven on Bun 1.4.2.

const PROVEN_BUN = '1.4.2';
const TEST_FILE = 'test/expect-matcher-runtime.test.ts';
const DELAY_MS = 80;

function runtimePremiseViolation(packageManager: unknown, runtime: string): string | undefined {
  const pin =
    typeof packageManager === 'string' && packageManager.startsWith('bun@')
      ? packageManager.slice('bun@'.length)
      : String(packageManager ?? '');
  const drifted: string[] = [];
  if (pin !== PROVEN_BUN) drifted.push(`package.json pins bun@${pin || '<missing>'}`);
  if (runtime !== PROVEN_BUN) drifted.push(`this run uses Bun ${runtime}`);
  if (drifted.length === 0) return undefined;
  return `${TEST_FILE} proves expect().resolves and expect().rejects block until the promise settles only on Bun ${PROVEN_BUN}, but ${drifted.join(' and ')}. Reject the pin back to bun@${PROVEN_BUN}, or rewrite the test for the new runtime and update PROVEN_BUN.`;
}

function after(
  ms: number,
  settle: (resolve: (value: number) => void, reject: (error: Error) => void) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    setTimeout(() => settle(resolve, reject), ms);
  });
}

describe('expect() promise matchers', () => {
  test('runs on the Bun version where resolves and rejects block', () => {
    const packageJson = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as {
      packageManager?: unknown;
    };
    const violation = runtimePremiseViolation(packageJson.packageManager, Bun.version);
    if (violation !== undefined) throw new Error(violation);
  });

  test('a pin outside the proven version fails, naming the test and the action', () => {
    const message = runtimePremiseViolation('bun@1.4.4', '1.4.4') ?? '';
    expect(message).toContain(TEST_FILE);
    expect(message).toContain(`Bun ${PROVEN_BUN}`);
    expect(message).toContain('bun@1.4.4');
    expect(message).toContain(`Reject the pin back to bun@${PROVEN_BUN}`);
    expect(message).toContain('rewrite the test');
    expect(runtimePremiseViolation('bun@1.4.2', '1.4.2')).toBeUndefined();
  });

  test('resolves returns undefined after the promise settles, and a wrong matcher throws', () => {
    const started = performance.now();
    const returned = expect(after(DELAY_MS, (resolve) => resolve(1))).resolves.toBe(1);
    expect(returned).toBeUndefined();
    expect(performance.now() - started).toBeGreaterThanOrEqual(DELAY_MS - 20);

    expect(() => {
      expect(Promise.resolve(1)).resolves.toBe(2);
    }).toThrow();
  });

  test('rejects returns undefined after the promise settles, and a wrong matcher throws', () => {
    const started = performance.now();
    const returned = expect(after(DELAY_MS, (_resolve, reject) => reject(new Error('slow')))).rejects.toThrow('slow');
    expect(returned).toBeUndefined();
    expect(performance.now() - started).toBeGreaterThanOrEqual(DELAY_MS - 20);

    expect(() => {
      expect(Promise.reject(new Error('slow'))).rejects.toThrow('other');
    }).toThrow();
  });
});
