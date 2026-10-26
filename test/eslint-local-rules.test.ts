import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

// Lints snippets with the repo's real eslint.config.js. The paths must be
// existing files: typed linting (projectService) rejects files outside the
// TS project, and lintText lints the given text instead of the file on disk.
const eslint = new ESLint({ cwd: `${import.meta.dir}/..` });

const COMMAND = 'src/commands/cards.ts';
const ALIASES = 'src/lib/aliases.ts';
const OTHER_SRC = 'src/lib/normalize.ts';
const CARD_INVOICE = 'src/commands/entries/card-invoice.ts';
const CURRENCY = 'src/utils/currency.ts';
const PARSE = 'src/utils/parse.ts';
const TEST = 'test/import-harness.ts';

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId?.startsWith('local/') ? [m.ruleId] : []));
}

const RAW_CURRENCY = "export const s = (1).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });";
const NUMBER_CALL = "export const n = Number('1e3');";
const DOUBLE_CAST = "export const v = ({} as unknown as { a: number }).a;";

describe('local/no-raw-currency', () => {
  test('fires in src, including card-invoice.ts', async () => {
    expect(await localRules(RAW_CURRENCY, OTHER_SRC)).toEqual(['local/no-raw-currency']);
    expect(await localRules(RAW_CURRENCY, COMMAND)).toEqual(['local/no-raw-currency']);
    expect(await localRules(RAW_CURRENCY, CARD_INVOICE)).toEqual(['local/no-raw-currency']);
  });

  test('does not fire in src/utils/currency.ts or for other styles', async () => {
    expect(await localRules(RAW_CURRENCY, CURRENCY)).toEqual([]);
    expect(await localRules("export const s = (1).toLocaleString('pt-BR', { style: 'percent' });", OTHER_SRC)).toEqual([]);
  });
});

describe('local/no-number-call', () => {
  test('fires in src/commands (including card-invoice.ts) and src/lib/aliases.ts', async () => {
    expect(await localRules(NUMBER_CALL, COMMAND)).toEqual(['local/no-number-call']);
    expect(await localRules(NUMBER_CALL, CARD_INVOICE)).toEqual(['local/no-number-call']);
    expect(await localRules(NUMBER_CALL, ALIASES)).toEqual(['local/no-number-call']);
  });

  test('does not fire outside its scope or for Number.parseInt', async () => {
    expect(await localRules(NUMBER_CALL, PARSE)).toEqual([]);
    expect(await localRules(NUMBER_CALL, OTHER_SRC)).toEqual([]);
    expect(await localRules("export const n = Number.parseInt('7', 10);", COMMAND)).toEqual([]);
  });
});

describe('local/no-double-cast', () => {
  test('fires in src/commands (including card-invoice.ts) and src/lib/aliases.ts', async () => {
    expect(await localRules(DOUBLE_CAST, COMMAND)).toEqual(['local/no-double-cast']);
    expect(await localRules(DOUBLE_CAST, CARD_INVOICE)).toEqual(['local/no-double-cast']);
    expect(await localRules(DOUBLE_CAST, ALIASES)).toEqual(['local/no-double-cast']);
  });

  test('does not fire outside its scope or for a single cast', async () => {
    expect(await localRules(DOUBLE_CAST, PARSE)).toEqual([]);
    expect(await localRules('export const v = ({ a: 1 } as { a: number }).a;', COMMAND)).toEqual([]);
  });
});

describe('local/no-due-anchor-fallback', () => {
  const card = 'declare const acc: { proximoVencimento?: string };';
  // The old selector only caught `proximoVencimento ?? ...`.
  const reads = {
    '??': 'export const d = acc.proximoVencimento ?? "2026-01-10";',
    '?.slice() ??': 'export const d = acc.proximoVencimento?.slice(0, 10) ?? null;',
    '||': 'export const d = acc.proximoVencimento || "2026-01-10";',
    ternary: 'export const d = acc.proximoVencimento ? acc.proximoVencimento : "2026-01-10";',
    'if (!x) throw': 'export function d() { if (!acc.proximoVencimento) throw new Error("no due date"); }',
    'optional chaining': 'export const d = (acc as typeof acc | undefined)?.proximoVencimento;',
    'computed key': 'export const d = acc["proximoVencimento"];',
    destructuring: 'export const { proximoVencimento } = acc;',
  };
  for (const [form, code] of Object.entries(reads)) {
    test(`fires on ${form}`, async () => {
      const rules = await localRules(`${card}\n${code}`, OTHER_SRC);
      expect(rules.length).toBeGreaterThan(0);
      expect(new Set(rules)).toEqual(new Set(['local/no-due-anchor-fallback']));
    });
  }

  test('fires in src/commands', async () => {
    expect(await localRules(`${card}\n${reads['||']}`, COMMAND)).toEqual(['local/no-due-anchor-fallback']);
  });

  test('does not fire in card-invoice.ts, on a type declaration or on other fields', async () => {
    expect(await localRules(`${card}\n${reads['||']}`, CARD_INVOICE)).toEqual([]);
    expect(await localRules('export interface A { proximoVencimento?: string }', OTHER_SRC)).toEqual([]);
    expect(await localRules('declare const acc: { proximoFechamento?: string };\nexport const d = acc.proximoFechamento ?? null;', OTHER_SRC)).toEqual([]);
  });
});

describe('local/no-ambient-clock', () => {
  // The forms the commands used before now()/today() existed.
  const reads = {
    'new Date()': "import { toLocalDateString } from '../lib/dates.js';\nexport const d = toLocalDateString(new Date());",
    'Date.now()': 'export const id = Date.now();',
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

test('clean code gets no local rule messages', async () => {
  const code = "import { parseId } from '../utils/parse.js';\nexport const id = parseId('7');";
  expect(await localRules(code, COMMAND)).toEqual([]);
});
