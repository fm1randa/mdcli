import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { pinMismatch } from '../scripts/bun-pin.js';
import { run } from './run.js';

const repoRoot = join(import.meta.dir, '..');
const script = join(repoRoot, 'scripts', 'bun-pin.ts');

describe('pinMismatch', () => {
  test('matches only when the field is bun@ plus the running version', () => {
    expect(pinMismatch('bun@1.4.2', '1.4.2')).toBeUndefined();
  });

  test('names the running version, the field, and the install line', () => {
    const message = pinMismatch('bun@1.4.2', '1.4.4') ?? '';
    expect(message).toContain('Bun 1.4.4 está no PATH. package.json pede bun@1.4.2.');
    expect(message).toContain('curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"');
    expect(message).not.toMatch(/\/home\/|~/);
  });

  test('a non-bun field still returns a message', () => {
    const message = pinMismatch('npm@10.0.0', '1.4.2') ?? '';
    expect(message).toContain('package.json pede npm@10.0.0.');
    expect(message).toContain('bun-vnpm@10.0.0');
  });
});

describe('bun scripts/bun-pin.ts', () => {
  test('the flags decide the comparison, so the host bun does not', async () => {
    const mismatch = await run(
      [process.execPath, script, '--running', '1.4.4', '--package-manager', 'bun@1.4.2'],
      { cwd: repoRoot },
    );
    expect(mismatch.exitCode).toBe(1);
    expect(mismatch.stdout).toContain('Bun 1.4.4 está no PATH. package.json pede bun@1.4.2.');
    expect(mismatch.stdout).toContain('curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"');
    expect(mismatch.stdout).not.toMatch(/\/home\/|~/);

    const match = await run(
      [process.execPath, script, '--running', '1.4.2', '--package-manager', 'bun@1.4.2'],
      { cwd: repoRoot },
    );
    expect(match.exitCode).toBe(0);
    expect(match.stdout).toBe('');
  });
});
