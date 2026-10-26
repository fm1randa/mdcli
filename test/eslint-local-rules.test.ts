import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ESLint, type AST } from 'eslint';
import tseslint from 'typescript-eslint';

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
const TEXT = 'src/utils/text.ts';
const TEST = 'test/import-harness.ts';

async function localRules(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.flatMap((m) => (m.ruleId?.startsWith('local/') ? [m.ruleId] : []));
}

const RAW_CURRENCY = "export const s = (1).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });";
const NUMBER_CALL = "export const n = Number('1e3');";
const RAW_CENTS = 'declare const v: number;\nexport const c = Math.round(Math.abs(v) * 100);';
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

describe('local/no-raw-cents', () => {
  test('fires in src on either operand order and anywhere in a product', async () => {
    expect(await localRules(RAW_CENTS, OTHER_SRC)).toEqual(['local/no-raw-cents']);
    expect(await localRules(RAW_CENTS, COMMAND)).toEqual(['local/no-raw-cents']);
    expect(await localRules('declare const v: number;\nexport const c = Math.round(100 * v) / 100;', OTHER_SRC)).toEqual(['local/no-raw-cents']);
    expect(await localRules('declare const v: number, n: number;\nexport const c = Math.round(v * 100 * n);', OTHER_SRC)).toEqual(['local/no-raw-cents']);
    expect(await localRules('declare const v: number, n: number;\nexport const c = Math.round(v * 100 / n);', OTHER_SRC)).toEqual(['local/no-raw-cents']);
  });

  test('does not fire in src/utils/currency.ts or on other rounding', async () => {
    expect(await localRules(RAW_CENTS, CURRENCY)).toEqual([]);
    expect(await localRules('declare const v: number;\nexport const c = Math.round(v / 3);', OTHER_SRC)).toEqual([]);
    expect(await localRules('declare const v: number;\nexport const c = Math.floor(v * 100);', OTHER_SRC)).toEqual([]);
  });
});

describe('local/no-raw-dash', () => {
  const dash = "import chalk from 'chalk';\nexport const s = chalk.gray('-');";

  test('fires in src outside text.ts', async () => {
    expect(await localRules(dash, OTHER_SRC)).toEqual(['local/no-raw-dash']);
    expect(await localRules(dash, COMMAND)).toEqual(['local/no-raw-dash']);
  });

  test('does not fire in src/utils/text.ts or on other gray text', async () => {
    expect(await localRules(dash, TEXT)).toEqual([]);
    expect(await localRules("import chalk from 'chalk';\nexport const s = chalk.gray('Inactive');", OTHER_SRC)).toEqual([]);
    expect(await localRules("import chalk from 'chalk';\nexport const s = chalk.red('-');", OTHER_SRC)).toEqual([]);
  });
});

describe('local/no-loose-number', () => {
  test('fires anywhere in src (including card-invoice.ts and src/lib)', async () => {
    expect(await localRules(NUMBER_CALL, COMMAND)).toEqual(['local/no-loose-number']);
    expect(await localRules(NUMBER_CALL, OTHER_SRC)).toEqual(['local/no-loose-number']);
    expect(await localRules(NUMBER_CALL, CARD_INVOICE)).toEqual(['local/no-loose-number']);
    expect(await localRules(NUMBER_CALL, ALIASES)).toEqual(['local/no-loose-number']);
  });

  // Each one coerces loosely like Number(): '12abc' is 12, +'' is 0.
  const coercions = {
    'Number.parseInt': "export const n = Number.parseInt('12abc', 10);",
    parseInt: "export const n = parseInt('12abc', 10);",
    'Number.parseFloat': "export const n = Number.parseFloat('1.5abc');",
    parseFloat: "export const n = parseFloat('1.5abc');",
    'unary +': "declare const s: string;\nexport const n = +s;",
    'Number as a value': "export const n = ['1'].map(Number);",
  };
  for (const [form, code] of Object.entries(coercions)) {
    test(`fires on ${form} in src, not in src/utils/parse.ts`, async () => {
      expect(await localRules(code, COMMAND)).toEqual(['local/no-loose-number']);
      expect(await localRules(code, PARSE)).toEqual([]);
    });
  }

  test('does not fire in src/utils/parse.ts, on a numeric literal or on other Number members', async () => {
    expect(await localRules(NUMBER_CALL, PARSE)).toEqual([]);
    expect(await localRules('export const n = +1;', COMMAND)).toEqual([]);
    expect(await localRules('export const ok = Number.isSafeInteger(7);', COMMAND)).toEqual([]);
    expect(await localRules('declare const x: unknown;\nexport const ok = Number.isSafeInteger(x);', COMMAND)).toEqual([]);
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

  // The exemption is per file: a new export of card-invoice.ts reading the field would pass the
  // rule with a third rule for a card without one. Lint the real file as if it lived elsewhere and
  // name the top-level declaration around each read, exported or not.
  async function readers(source: string): Promise<Set<string>> {
    const [result] = await eslint.lintText(source, { filePath: OTHER_SRC });
    // The parser eslint.config.js lints with; its AST is ESTree plus TS nodes.
    const program = tseslint.parser.parseForESLint(source).ast as AST.Program;
    const names = result.messages
      .filter((m) => m.ruleId === 'local/no-due-anchor-fallback')
      .map((m) => {
        const statement = program.body.find((s) => s.loc && s.loc.start.line <= m.line && m.line <= s.loc.end.line);
        return (statement && declarationName(statement)) ?? `line ${m.line}`;
      });
    return new Set(names);
  }

  const source = readFileSync(`${import.meta.dir}/../${CARD_INVOICE}`, 'utf8');

  test('only cardDueAnchor and ownDueDate read the field in card-invoice.ts', async () => {
    expect(await readers(source)).toEqual(new Set(['cardDueAnchor', 'ownDueDate']));
  });

  test('names a const or a non-exported helper that reads the field', async () => {
    const extra = 'export const reader = (a: Account) => a.proximoVencimento;\nfunction helper(a: Account) { return a.proximoVencimento; }';
    expect(await readers(`${source}\n${extra}\n`)).toEqual(new Set(['cardDueAnchor', 'ownDueDate', 'reader', 'helper']));
  });
});

function declarationName(statement: AST.Program['body'][number]): string | undefined {
  const node =
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement;
  if (node?.type === 'FunctionDeclaration') return node.id?.name;
  if (node?.type === 'VariableDeclaration') {
    return node.declarations.map((d) => (d.id.type === 'Identifier' ? d.id.name : '?')).join(', ');
  }
  return undefined;
}

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

test('clean code gets no local rule messages', async () => {
  const code = "import { parseId } from '../utils/parse.js';\nexport const id = parseId('7');";
  expect(await localRules(code, COMMAND)).toEqual([]);
});
