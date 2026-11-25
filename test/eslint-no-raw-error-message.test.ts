import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { git } from '../scripts/git.js';

const ROOT = `${import.meta.dir}/..`;
const eslint = new ESLint({ cwd: ROOT });
const RULE = 'local/no-raw-error-message';
const AREAS = ['src/lib/normalize.ts', 'bin/cli.ts'];

// Typed linting builds each area's program on its first lintText call, which
// takes longer than a test's timeout: build them before the tests run.
for (const area of [...AREAS, 'scripts/risk.ts', 'test/helpers.ts']) {
  await eslint.lintText('export const answer = 42;\n', { filePath: area });
}

interface Hit {
  line: number;
  message: string;
}

async function hits(code: string, filePath: string): Promise<Hit[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId === RULE ? [{ line: m.line, message: m.message }] : []));
}

async function lines(code: string, filePath: string): Promise<number[]> {
  return (await hits(code, filePath)).map((hit) => hit.line);
}

const FORMS: Record<string, string> = {
  'a string literal': "export function f(): never {\n  throw new Error('Use only one of pending, confirmed and reconciled.');\n}",
  'a template literal': 'export function f(code: string): never {\n  throw new Error(`unknown budget kind code: ${code}`);\n}',
  'a concatenation': "export function f(path: string): never {\n  throw new Error(\n    `blocked at: ${path}\\n` + 'Restart the terminal');\n}",
  'Error called without new': "export function f(): Error {\n  return Error('invalid year');\n}",
};

// main when #350 was filed: every Error built from text written in place, by line.
const BEFORE = 'e6c290d';
const COPIES: Record<string, number[]> = {
  'src/lib/savings-goals.ts': [68, 143],
  'src/lib/budget.ts': [21],
  'src/lib/api/entries.ts': [33],
  'src/lib/dates.ts': [21],
  'src/lib/browser-session/profile-copy.ts': [41],
  'src/lib/browser-session/firefox.ts': [140],
  'src/lib/browser-session/index.ts': [64, 168],
  'src/commands/entries/status.ts': [53],
  'src/commands/goals.ts': [129],
};

describe('local/no-raw-error-message', () => {
  for (const [form, code] of Object.entries(FORMS)) {
    test(`fires on ${form} in src and bin`, async () => {
      const line = code.split('\n').findIndex((text) => text.includes('Error(')) + 1;
      for (const area of AREAS) expect(await lines(code, area)).toEqual([line]);
    });
  }

  test('the message names the catalog fix and the type fix', async () => {
    const [hit] = await hits(FORMS['a string literal'], AREAS[0]);
    expect(hit.message).toContain("new Error(t('errorKey', ...args))");
    expect(hit.message).toContain('src/lib/i18n/catalog/pt-BR and en');
    expect(hit.message).toContain('narrowing the type');
  });

  test('does not fire on a catalog message, a message passed through, or other constructors', async () => {
    const code = [
      "import { t } from './i18n/index.js';",
      "export const a = new Error(t('errorNotLoggedIn'));",
      'export const b = (message: string): Error => new Error(message, { cause: message });',
      'export const c = new Error();',
      "export const d = new Set(['text']);",
    ].join('\n');
    expect(await lines(code, AREAS[0])).toEqual([]);
  });

  test('is off in test/ and scripts/, where only developers read the message', async () => {
    expect(await lines(FORMS['a string literal'], 'test/helpers.ts')).toEqual([]);
    expect(await lines(FORMS['a string literal'], 'scripts/risk.ts')).toEqual([]);
  });

  for (const [file, expected] of Object.entries(COPIES)) {
    test(`catches the copies main carried at ${BEFORE} in ${file}, and the branch carries none`, async () => {
      expect(await lines(await git(['show', `${BEFORE}:${file}`], ROOT), file)).toEqual(expected);
      expect(await lines(readFileSync(`${ROOT}/${file}`, 'utf8'), file)).toEqual([]);
    });
  }
});
