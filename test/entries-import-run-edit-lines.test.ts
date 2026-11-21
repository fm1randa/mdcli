import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { FakeEditor } from './import-edit-harness.js';
import { CONNECTIONS, mockStatement, SINCE, type BankTransaction, type CandidateEntry } from './import-harness.js';
import type { Category } from '../src/types/index.js';

// Fictional ids. 201 is Conta Teste (connection account 301).
// Categories: 10 Alimentação (d), 20 Salário (r), 60 Antiga (d, inactive).
const INACTIVE = { ...CATEGORIES_RESPONSE.items[4], id: 60, nome: 'Antiga', nomeRel: 'Antiga', status: false };

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';
const RULE_10 = { c: { d: { categoria: { v: '10' }, descricao: { v: 'Padaria' } } } };

let api: MockApi;
let home: TestHome;
let fake: FakeEditor;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, INACTIVE] });
  api.on('GET /v1/lancamentos/duplicidade', {});
  entries([]);
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  home = createHome(MANUAL_AUTH);
  fake = new FakeEditor();
});

afterEach(() => {
  api.stop();
  home.cleanup();
  fake.cleanup();
});

function bank(integrationId: string, extra: Partial<BankTransaction> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: BankTransaction[]) {
  mockStatement(api, rows, { saldo: 250.5 });
}

function entries(list: CandidateEntry[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function run(args: string[], editor: string, stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '201', '--since', SINCE, '--edit', ...args], {
    home,
    api,
    stdin,
    extraEnv: { EDITOR: editor },
  });
}

function lancamentos(index: number): unknown {
  return (mutations(api)[index].body as { lancamentos: unknown }).lancamentos;
}

describe('entries import run --edit lines', () => {
  test('--include-duplicates opens a duplicate as import instead of skip', async () => {
    statement([bank(TX1, { _ca: RULE_10 })]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });
    const editor = fake.script([null]);

    const result = await run(['--include-duplicates', '--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | Padaria\n');
    expect(JSON.parse(result.stdout).imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an untouched line with an empty bank description parses and imports', async () => {
    statement([bank(TX1, { descricao: '', _ca: { c: { d: { categoria: { v: '10' } } } } })]);
    const editor = fake.script([null]);

    const result = await run(['--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 Alimentação | \n');
    expect(JSON.parse(result.stdout).imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    expect(fake.calls()).toBe(1);
  });

  test('an import line with an empty description falls back to the suggestion, then to the bank text', async () => {
    statement([bank(TX1, { _ca: RULE_10 }), bank(TX2, { valor: -7, descricao: 'Feira do banco' })]);
    const editor = fake.script([
      'import aaaa1111 2026-10-07 -12.34 Alimentação |\nimport bbbb2222 2026-10-07 -7 Alimentação | \n',
    ]);

    const result = await run(['--dry-run', '--json'], editor);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).imported).toEqual([
      expect.objectContaining({ integrationId: TX1, description: 'Padaria' }),
      expect.objectContaining({ integrationId: TX2, description: 'Feira do banco' }),
    ]);
    expect(fake.calls()).toBe(1);
  });

  test('an untouched line keeps the suggested category when another category has the same name', async () => {
    // 40 Outros (d) is the rule's suggestion; 41 Outros (r) shares the name and would win a lookup by name.
    const twin: Category = { ...CATEGORIES_RESPONSE.items[4], id: 41, tipo: 'r' };
    api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, twin] });
    statement([bank(TX1, { _ca: { c: { d: { categoria: { v: '40' } } } } })]);

    const result = await run(['--yes'], fake.script([null]));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(fake.calls()).toBe(1);
    expect(fake.seen(1)).toContain('import aaaa1111 2026-10-07 -12.34 40 | Padaria Ficticia\n');
    expect(lancamentos(2)).toEqual([expect.objectContaining({ integrationId: TX1, categoria: 40 })]);
  });

  test('writing the suggested name back on its line keeps the suggested category', async () => {
    const twin: Category = { ...CATEGORIES_RESPONSE.items[4], id: 41, tipo: 'r' };
    api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, twin] });
    statement([bank(TX1, { _ca: { c: { d: { categoria: { v: '40' } } } } })]);

    const result = await run(['--yes'], fake.script(['import aaaa1111 2026-10-07 -12.34 outros | Padaria\n']));

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(lancamentos(2)).toEqual([expect.objectContaining({ integrationId: TX1, categoria: 40, descricao: 'Padaria' })]);
  });

  test('--reject and --category do not combine with --edit', async () => {
    statement([bank(TX1)]);

    for (const extra of [['--reject', 'aaaa1111'], ['-c', '10']]) {
      const result = await run(extra, fake.script([null]));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--edit');
    }
    expect(fake.calls()).toBe(0);
    expect(mutations(api)).toHaveLength(0);
  });
});
