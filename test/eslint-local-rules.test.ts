import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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

  // The exemption is per file: a new export of card-invoice.ts reading the field would pass the
  // rule with a third rule for a card without one. Lint the real file as if it lived elsewhere.
  test('only cardDueAnchor and ownDueDate read the field in card-invoice.ts', async () => {
    const source = readFileSync(`${import.meta.dir}/../${CARD_INVOICE}`, 'utf8');
    const [result] = await eslint.lintText(source, { filePath: OTHER_SRC });
    const lines = source.split('\n');
    const readers = result.messages
      .filter((m) => m.ruleId === 'local/no-due-anchor-fallback')
      .map((m) => {
        const declaration = lines
          .slice(0, m.line)
          .reverse()
          .find((line) => /^export (async )?function /.test(line));
        return declaration?.match(/function (\w+)/)?.[1] ?? `line ${m.line}`;
      });
    expect(readers.length).toBeGreaterThan(0);
    expect(new Set(readers)).toEqual(new Set(['cardDueAnchor', 'ownDueDate']));
  });
});

test('clean code gets no local rule messages', async () => {
  const code = "import { parseId } from '../utils/parse.js';\nexport const id = parseId('7');";
  expect(await localRules(code, COMMAND)).toEqual([]);
});
