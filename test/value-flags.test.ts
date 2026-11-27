import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { git } from '../scripts/git.js';
import { run } from './run.js';

const ROOT = join(import.meta.dir, '..');

// Each gate used to read a flag value as argv[++index], so a value flag
// followed by another flag took that flag as its value and went on with it
// (#353). Every row is a real script run: the value flag comes right before
// another flag, and the script must refuse it by name instead.
const CASES: { script: string; argv: string[]; error: string }[] = [
  { script: 'bun-pin.ts', argv: ['--running', '--package-manager', 'bun@1.4.2'], error: '--running needs a version' },
  { script: 'check-private-messages.ts', argv: ['--body-file', '--base', 'HEAD'], error: '--body-file needs a file' },
  { script: 'risk.ts', argv: ['--diff', '--unknown'], error: '--diff needs a file' },
  { script: 'prova.ts', argv: ['--body-file', '--diff', 'x.diff'], error: '--body-file needs a file' },
  { script: 'new-tests-fail-on-main.ts', argv: ['--files', '--repeat', '1'], error: '--files needs a comma-separated list of test files' },
  { script: 'replay-gates.ts', argv: ['--gate', '--json'], error: '--gate needs a name' },
  { script: 'risk-label.ts', argv: ['--report', '--json'], error: '--report needs a file' },
  { script: 'private-terms-corpus.ts', argv: ['--head', '--base', 'HEAD'], error: '--head needs a revision' },
  { script: 'check-eslint-disables.ts', argv: ['--head', '--base', 'HEAD'], error: '--head needs a revision' },
];

// The table is checked against the code, not kept by hand (#361): every script
// that reads a value flag through scripts/git.ts has a row, so a new gate that
// takes one cannot skip this test.
const PARSERS = 'parseValueFlags\\?\\|parseRevisionFlag\\|parseBase';

describe('scripts refuse a value flag followed by another flag', () => {
  test('every script that parses a value flag has a row', async () => {
    const listed = await git(['grep', '-l', PARSERS, '--', 'scripts/*.ts'], ROOT);
    const parsing = listed.split('\n').filter((path) => path !== '' && path !== 'scripts/git.ts');
    expect(parsing).toContain('scripts/private-terms-corpus.ts');
    expect(parsing.map((path) => path.slice('scripts/'.length)).sort()).toEqual(CASES.map((row) => row.script).sort());
  });

  for (const { script, argv, error } of CASES) {
    test(`${script} ${argv.join(' ')}`, async () => {
      const result = await run([process.execPath, join(ROOT, 'scripts', script), ...argv], { cwd: ROOT });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(error);
    });
  }

  test('bun-pin.ts still compares the versions the two flags name', async () => {
    const result = await run(
      [process.execPath, join(ROOT, 'scripts', 'bun-pin.ts'), '--package-manager', 'bun@1.4.2', '--running', '1.4.4'],
      { cwd: ROOT },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Bun 1.4.4 está no PATH. package.json pede bun@1.4.2.');
  });
});
