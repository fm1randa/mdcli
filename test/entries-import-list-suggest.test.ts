import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank. 9001 is its connection account, not the Account id.
const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }],
  },
];

const EXPENSE_ID = 'eeeeeeee-1111-4000-8000-000000000001';
const INCOME_ID = 'eeeeeeee-2222-4000-8000-000000000002';
const ZERO_ID = 'ffffffff-1111-4000-8000-000000000001';
const TRANSFER_ID = 'ffffffff-2222-4000-8000-000000000002';
const RULE_TEXT_ID = 'aaaaaaaa-1111-4000-8000-0000000000a1';
const FALLBACK_TEXT_ID = 'bbbbbbbb-1111-4000-8000-0000000000b1';
const BANK_TEXT_ID = 'cccccccc-1111-4000-8000-0000000000c1';
const TAG_ONE = '11111111-1111-4000-8000-000000000001';
const TAG_MANY = '22222222-2222-4000-8000-000000000002';
const TAG_TRANSFER = '33333333-3333-4000-8000-000000000003';
const TAG_NONE = '44444444-4444-4000-8000-000000000004';
const TAG_MIXED = '55555555-5555-4000-8000-000000000005';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api, extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' } });
}

function statement(rows: unknown[]) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-09-01',
    fim: '2026-10-31',
    saldo: 10,
    lancamentos: rows,
  });
}

describe('entries import list suggestions', () => {
  test('uses the learned expense category and the catalog name, and does not write', async () => {
    statement([
      {
        integrationId: EXPENSE_ID,
        descricao: 'Padaria do Bairro',
        valor: -12.34,
        data: '2026-10-07',
        moeda: 1,
        _ca: {
          st: false,
          c: {
            d: { categoria: { v: 11, k: [{ k: 'padaria', v: 'padaria' }] } },
            r: { categoria: { v: 20 } },
            t: { categoria: { v: 30 } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.ai).toBe('unused');
    expect(body.account).toEqual({ id: 1001, name: 'Nubank' });
    expect(body.transactions).toEqual([
      {
        integrationId: EXPENSE_ID,
        prefix: 'eeeeeeee',
        date: '2026-10-07',
        value: -12.34,
        description: 'Padaria do Bairro',
        suggestedDescription: null,
        suggestedTagIds: [],
        suggestedCategory: { id: 11, name: 'Alimentação/Mercado', source: 'rule' },
        duplicateOf: null,
        candidates: [],
        defaultAction: 'import',
      },
    ]);
    const paths = api.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /v1/cadastros/categorias');
    expect(paths.some((path) => /regras|smartmatch|markImported|importar|conciliacao/.test(path))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('uses the learned income category when the value is positive', async () => {
    statement([
      {
        integrationId: INCOME_ID,
        descricao: 'Credito Ficticio',
        valor: 8.5,
        data: '2026-10-08',
        _ca: {
          c: {
            d: { categoria: { v: 11 } },
            r: { categoria: { v: 20 } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).transactions).toEqual([
      {
        integrationId: INCOME_ID,
        prefix: 'eeeeeeee',
        date: '2026-10-08',
        value: 8.5,
        description: 'Credito Ficticio',
        suggestedDescription: null,
        suggestedTagIds: [],
        suggestedCategory: { id: 20, name: 'Salário', source: 'rule' },
        duplicateOf: null,
        candidates: [],
        defaultAction: 'import',
      },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('a zero value does not take the expense or income category', async () => {
    statement([
      {
        integrationId: ZERO_ID,
        descricao: 'Ajuste Zerado',
        valor: 0,
        data: '2026-10-09',
        _ca: {
          d: 'Texto do Zero',
          c: {
            d: { categoria: { v: 11 }, descricao: { v: 'Nao Esta' }, tags: { v: 501 } },
            r: { categoria: { v: 20 } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.suggestedCategory).toBeNull();
    expect(row.suggestedDescription).toBe('Texto do Zero');
    expect(row.suggestedTagIds).toEqual([]);
    expect(row.description).toBe('Ajuste Zerado');
    expect(row.defaultAction).toBe('needs-category');
    expect(row.value).toBe(0);
    expect(api.requests.some((r) => r.path === '/v1/cadastros/categorias')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('a transfer flagged by _ca.st uses the t category even when the value is negative', async () => {
    statement([
      {
        integrationId: TRANSFER_ID,
        descricao: 'Ted Ficticia',
        valor: -40,
        data: '2026-10-10',
        _ca: {
          st: true,
          d: 'Fallback D',
          c: {
            d: { categoria: { v: 11 }, descricao: { v: 'Despesa' }, tags: { v: 501 } },
            t: { categoria: { v: 30 }, descricao: { v: 'Transferencia Sugerida' }, tags: { v: [502] } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.suggestedCategory).toEqual({ id: 30, name: 'Transferência', source: 'rule' });
    expect(row.suggestedDescription).toBe('Transferencia Sugerida');
    expect(row.suggestedTagIds).toEqual([502]);
    expect(row.description).toBe('Ted Ficticia');
    expect(row.defaultAction).toBe('import');
    expect(mutations(api)).toHaveLength(0);
  });

  test('suggests descricao from the learned field, then _ca.d, and never the bank text', async () => {
    statement([
      {
        integrationId: RULE_TEXT_ID,
        descricao: 'Texto do Banco',
        valor: -3,
        data: '2026-10-11',
        _ca: {
          d: 'Fallback D',
          c: {
            d: { descricao: { v: 'Descricao da Regra' } },
            r: { descricao: { v: 'Descricao de Receita' } },
          },
        },
      },
      {
        integrationId: FALLBACK_TEXT_ID,
        descricao: 'Outro Texto do Banco',
        valor: -4,
        data: '2026-10-12',
        _ca: {
          d: 'Somente Ca D',
          c: { r: { descricao: { v: 'Nao Essa' } } },
        },
      },
      {
        integrationId: BANK_TEXT_ID,
        descricao: 'Fica no Banco',
        valor: -5,
        data: '2026-10-13',
        _ca: { d: 12, c: { d: { descricao: { v: 99 } } } },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const rows = JSON.parse(result.stdout).transactions;
    expect(rows.map((row: { description: string | null; suggestedDescription: string | null }) => ({
      description: row.description,
      suggestedDescription: row.suggestedDescription,
    }))).toEqual([
      { description: 'Texto do Banco', suggestedDescription: 'Descricao da Regra' },
      { description: 'Outro Texto do Banco', suggestedDescription: 'Somente Ca D' },
      { description: 'Fica no Banco', suggestedDescription: null },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('reads suggested ids as numbers or decimal-integer strings, one or a list', async () => {
    statement([
      {
        integrationId: TAG_ONE,
        descricao: 'Uma Tag',
        valor: -2,
        data: '2026-10-14',
        _ca: { c: { d: { tags: { v: 501 } } } },
      },
      {
        integrationId: TAG_MANY,
        descricao: 'Duas Tags',
        valor: -3,
        data: '2026-10-15',
        _ca: { c: { d: { tags: { v: [501, 502] } } } },
      },
      {
        integrationId: TAG_TRANSFER,
        descricao: 'Tag de Transferencia',
        valor: -6,
        data: '2026-10-16',
        _ca: {
          st: true,
          c: {
            d: { tags: { v: 501 } },
            t: { tags: { v: [502] } },
          },
        },
      },
      {
        integrationId: TAG_NONE,
        descricao: 'Sem Campo',
        valor: -7,
        data: '2026-10-17',
        _ca: { c: { d: { categoria: { v: 11 } } } },
      },
      {
        integrationId: TAG_MIXED,
        descricao: 'Tags Misturadas',
        valor: 9,
        data: '2026-10-18',
        _ca: { c: { r: { tags: { v: [501, '502', 1.5] }, categoria: { v: '20' } } } },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const rows = JSON.parse(result.stdout).transactions;
    expect(rows.map((row: { suggestedTagIds: number[]; suggestedCategory: { id: number } | null }) => ({
      suggestedTagIds: row.suggestedTagIds,
      categoryId: row.suggestedCategory?.id ?? null,
    }))).toEqual([
      { suggestedTagIds: [501], categoryId: null },
      { suggestedTagIds: [501, 502], categoryId: null },
      { suggestedTagIds: [502], categoryId: null },
      { suggestedTagIds: [], categoryId: 11 },
      { suggestedTagIds: [501, 502], categoryId: 20 },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });
});
