import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

// Lints snippets with the repo's real eslint.config.js. The paths must be
// existing files: typed linting (projectService) rejects files outside the
// TS project, and lintText lints the given text instead of the file on disk.
const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

// Typed linting builds the TypeScript program on the first lintText call, which
// under the parallel test run takes longer than a single test's timeout. Warm it
// up before the tests so the cold start is not charged to the first one.
await eslint.lintText('export const answer = 42;\n', { filePath: 'src/lib/normalize.ts' });

const COMMAND = 'src/commands/cards.ts';
const OTHER_SRC = 'src/lib/normalize.ts';
const CARD_INVOICE = 'src/commands/entries/card-invoice.ts';
const TEST = 'test/import-harness.ts';
const BIN = 'bin/cli.ts';
const TYPE = 'src/commands/entries/type.ts';

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId?.startsWith('local/') ? [m.ruleId] : []));
}

describe('local/no-category-name-resolution', () => {
  // The two copies #182 found: entries create/update (#77) and categories
  // --move-to (#172) each filtered the catalog by active status and name.
  const declarations = 'declare const items: { id: number; nome: string; status: boolean }[];\ndeclare const input: string;\ndeclare function sameName(a: string, b: string): boolean;';
  const entriesCopy = `${declarations}\nexport const active = items.find((c) => c.status && sameName(c.nome, input));`;
  const categoriesCopy = `${declarations}\nexport const active = items.filter((c) => c.status && sameName(c.nome, input));`;
  const owner = 'src/lib/category-resolution.ts';

  test('fires on both old name filters in src/commands', async () => {
    expect(await localRules(entriesCopy, 'src/commands/entries/category.ts')).toEqual(['local/no-category-name-resolution']);
    expect(await localRules(categoriesCopy, 'src/commands/categories.ts')).toEqual(['local/no-category-name-resolution']);
  });

  test('does not fire in the owner or on name matching without a status check', async () => {
    expect(await localRules(categoriesCopy, owner)).toEqual([]);
    expect(await localRules(`${declarations}\nexport const same = sameName('Moradia', input);`, 'src/commands/entries/import/edit-file.ts')).toEqual([]);
  });
});

describe('local/no-ambient-clock', () => {
  // The forms the commands used before now()/today() existed.
  const reads = {
    'new Date()': "import { toLocalDateString } from '../lib/dates.js';\nexport const d = toLocalDateString(new Date());",
    'Date.now()': 'export const id = Date.now();',
    "Date['now']()": "export const id = Date['now']();",
    'globalThis.Date.now()': 'export const id = globalThis.Date.now();',
    'new globalThis.Date()': 'export const d = new globalThis.Date();',
  };
  for (const [form, code] of Object.entries(reads)) {
    test(`fires on ${form} in src/commands`, async () => {
      expect(await localRules(code, COMMAND)).toEqual(['local/no-ambient-clock']);
      expect(await localRules(code, CARD_INVOICE)).toEqual(['local/no-ambient-clock']);
    });
  }

  test('does not fire on a Date built from a value or outside src/commands', async () => {
    expect(await localRules("export const d = new Date('2026-10-26T00:00:00');", COMMAND)).toEqual([]);
    expect(await localRules('export const d = new Date(2026, 9, 26);', COMMAND)).toEqual([]);
    expect(await localRules(reads['new Date()'].replace('../lib/', './'), OTHER_SRC)).toEqual([]);
  });
});

describe('local/no-literal-since', () => {
  test('fires on a fixed YYYY-MM-DD right after --since in tests', async () => {
    expect(await localRules("export const args = ['entries', 'import', 'list', '--since', '2026-10-01'];", TEST)).toEqual(['local/no-literal-since']);
    expect(await localRules('export const args = [`--since`, `2026-09-15`, `--json`];', TEST)).toEqual(['local/no-literal-since']);
  });

  test('fires on the inline --since=YYYY-MM-DD form', async () => {
    expect(await localRules("export const args = ['entries', 'import', 'list', '--since=2026-10-01'];", TEST)).toEqual(['local/no-literal-since']);
    expect(await localRules('export const arg = `--since=2026-10-01`;', TEST)).toEqual(['local/no-literal-since']);
  });

  test('fires on --since and a fixed date as adjacent call arguments', async () => {
    expect(await localRules("export const args: string[] = [];\nargs.push('--since', '2026-10-01');", TEST)).toEqual(['local/no-literal-since']);
  });

  test('does not fire on a computed date, an invalid input, or another flag', async () => {
    expect(await localRules("declare const SINCE: string;\nexport const args = ['--since', SINCE];", TEST)).toEqual([]);
    expect(await localRules("export const args = ['--since', 'not-a-date', '--since', '22/10/2026'];", TEST)).toEqual([]);
    expect(await localRules("export const args = ['--search-from', '2026-10-01'];", TEST)).toEqual([]);
    expect(await localRules("declare const SINCE: string;\nexport const args = [`--since=${SINCE}`];\nargs.push('--since', SINCE);", TEST)).toEqual([]);
    expect(await localRules("export const args = ['--since=yesterday'];\nargs.push('--json', '2026-10-01');", TEST)).toEqual([]);
  });
});

describe('local/no-type-sign-ternary', () => {
  test('fires on a ternary comparing the type to r outside type.ts', async () => {
    expect(await localRules("declare const tipo: string;\nexport const sign = tipo === 'r' ? 1 : -1;", COMMAND)).toEqual(['local/no-type-sign-ternary']);
    expect(await localRules("declare const tipo: string;\nexport const sign = tipo !== 'r' ? -1 : 1;", OTHER_SRC)).toEqual(['local/no-type-sign-ternary']);
    expect(await localRules("declare const tipo: string;\nexport const sign = tipo == 'r' ? 1 : -1;", COMMAND)).toEqual(['local/no-type-sign-ternary']);
  });

  test('does not fire in type.ts or on other comparisons', async () => {
    expect(await localRules("declare const tipo: string;\nexport const sign = tipo === 'r' ? 1 : -1;", TYPE)).toEqual([]);
    expect(await localRules("declare const tipo: string;\nexport const sign = tipo === 'd' ? -1 : 1;", COMMAND)).toEqual([]);
    expect(await localRules("declare const ok: boolean;\nexport const label = ok ? 'yes' : 'no';", COMMAND)).toEqual([]);
  });
});

describe('local/no-short-option-equals', () => {
  test('fires in bin/cli.ts when argv reaches parseAsync without preprocessing', async () => {
    expect(await localRules("declare const program: { parseAsync(argv: string[]): Promise<unknown> };\nconst argv: string[] = [];\nawait program.parseAsync(argv);", BIN)).toEqual(['local/no-short-option-equals']);
    expect(await localRules("declare const program: { parseAsync(argv: string[]): Promise<unknown> };\nawait program.parseAsync(process.argv);", BIN)).toEqual(['local/no-short-option-equals']);
  });

  test('does not fire when argv passes through preprocessShortOptions first', async () => {
    expect(await localRules("declare const program: { parseAsync(argv: string[]): Promise<unknown> };\ndeclare function preprocessShortOptions(argv: string[]): string[];\nawait program.parseAsync(preprocessShortOptions(process.argv));", BIN)).toEqual([]);
    expect(await localRules("declare const program: { parseAsync(argv: string[]): Promise<unknown> };\ndeclare function preprocessShortOptions(argv: string[]): string[];\nconst argv = preprocessShortOptions(process.argv);\nawait program.parseAsync(argv);", BIN)).toEqual([]);
  });
});
