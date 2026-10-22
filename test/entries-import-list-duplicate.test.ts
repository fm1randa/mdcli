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
const DUP_MATCH = 'a1a1a1a1-1111-4000-8000-000000000001';
const DUP_OTHER_VALUE = 'b2b2b2b2-2222-4000-8000-000000000002';
const DUP_OTHER_DAY = 'c3c3c3c3-3333-4000-8000-000000000003';
const DUP_SAME_VALUE = 'd4d4d4d4-4444-4000-8000-000000000004';
const UNKNOWN_CATEGORY = '99999999-1111-4000-8000-000000000001';

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
  return runCli(args, { home, api });
}

function statement(rows: unknown[]) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-09-01',
    fim: '2026-10-31',
    saldo: 10,
    lancamentos: rows,
  });
}

describe('entries import list duplicates', () => {
  test('leaves the category name null when the catalog has no such id', async () => {
    statement([
      {
        integrationId: UNKNOWN_CATEGORY,
        descricao: 'Categoria Sumida',
        valor: -8,
        data: '2026-10-19',
        _ca: { c: { d: { categoria: { v: 999 } } } },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).transactions[0].suggestedCategory).toEqual({
      id: 999,
      name: null,
      source: 'rule',
    });
    expect(JSON.parse(result.stdout).transactions[0].defaultAction).toBe('import');
    expect(api.requests.some((r) => r.path === '/v1/cadastros/categorias')).toBe(true);
    expect(mutations(api)).toHaveLength(0);
  });

  test('marks the same date and value as a duplicate, skips it, and keeps the account from --account', async () => {
    statement([
      {
        integrationId: DUP_MATCH,
        descricao: 'Padaria do Bairro',
        valor: -12.34,
        data: '2026-10-20',
        _ca: { c: { d: { categoria: { v: 11 }, conta: { v: 1004 } } } },
      },
      {
        integrationId: DUP_OTHER_VALUE,
        descricao: 'Mesmo Dia',
        valor: -1,
        data: '2026-10-20',
      },
      {
        integrationId: DUP_OTHER_DAY,
        descricao: 'Outro Dia',
        valor: -1,
        data: '2026-10-03',
      },
      {
        integrationId: DUP_SAME_VALUE,
        descricao: 'Mesmo Valor',
        valor: -12.34,
        data: '2026-10-03',
      },
    ]);
    api.on('GET /v1/lancamentos/duplicidade', {
      '2026-10-20': [
        { id: 77, valor: -12.34 },
        { id: 88, valor: -12.34 },
      ],
      '2026-10-03': [{ id: 91, valor: -1 }, { id: 92, valor: '-12.34' }],
      '2026-10-21': [{ id: 93, valor: -12.34 }],
    });

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.account).toEqual({ id: 1001, name: 'Nubank' });
    expect(body.connection).toEqual({ id: 501, connectionAccount: 9001 });
    expect(body.transactions.map((row: { duplicateOf: number | null; defaultAction: string; suggestedCategory: { id: number } | null }) => ({
      duplicateOf: row.duplicateOf,
      defaultAction: row.defaultAction,
      categoryId: row.suggestedCategory?.id ?? null,
    }))).toEqual([
      { duplicateOf: 77, defaultAction: 'skip', categoryId: 11 },
      { duplicateOf: null, defaultAction: 'needs-category', categoryId: null },
      { duplicateOf: 91, defaultAction: 'skip', categoryId: null },
      { duplicateOf: null, defaultAction: 'needs-category', categoryId: null },
    ]);
    const call = api.requests.find((r) => r.path === '/v1/lancamentos/duplicidade');
    expect(call?.method).toBe('GET');
    expect(call?.query.get('inicio')).toBe('2026-10-03');
    expect(call?.query.get('fim')).toBe('2026-10-20');
    expect(call?.query.get('conta')).toBe('1001');
    expect([...(call?.query.keys() ?? [])]).toEqual(['inicio', 'fim', 'conta']);
    const paths = api.requests.map((r) => `${r.method} ${r.path}`);
    expect(paths.some((path) => /regras|smartmatch|markImported|importar|conciliacao/.test(path))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('asks for duplicates from the earliest calendar date to the latest, not the statement period', async () => {
    statement([
      { integrationId: DUP_MATCH, descricao: 'Sem Data', valor: -1 },
      { integrationId: DUP_OTHER_VALUE, descricao: 'Data Ruim', valor: -1, data: 'not-a-date' },
      { integrationId: DUP_OTHER_DAY, descricao: 'Mais Recente', valor: -2, data: '2026-10-20' },
      { integrationId: DUP_SAME_VALUE, descricao: 'Mais Antiga', valor: -3, data: '2026-10-04' },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const call = api.requests.find((r) => r.path === '/v1/lancamentos/duplicidade');
    expect(call?.query.get('inicio')).toBe('2026-10-04');
    expect(call?.query.get('fim')).toBe('2026-10-20');
    expect(call?.query.get('conta')).toBe('1001');
    expect(api.requests.filter((r) => r.path === '/v1/lancamentos/duplicidade')).toHaveLength(1);
    expect(mutations(api)).toHaveLength(0);
  });

  test('does not ask for duplicates or categories when the statement is empty', async () => {
    statement([]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).transactions).toEqual([]);
    expect(api.requests.some((r) => r.path === '/v1/lancamentos/duplicidade')).toBe(false);
    expect(api.requests.some((r) => r.path === '/v1/cadastros/categorias')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('prints the suggested category, description, tags, and duplicate beside the bank columns', async () => {
    statement([
      {
        integrationId: EXPENSE_ID,
        descricao: 'Padaria do Bairro',
        valor: -12.34,
        data: '2026-10-07',
        _ca: {
          c: {
            d: {
              categoria: { v: 11 },
              descricao: { v: 'Padaria Sugerida' },
              tags: { v: [501, 502] },
            },
          },
        },
      },
      {
        integrationId: UNKNOWN_CATEGORY,
        descricao: 'Sem Nome',
        valor: -2,
        data: '2026-10-08',
        _ca: { c: { d: { categoria: { v: 999 } } } },
      },
    ]);
    api.on('GET /v1/lancamentos/duplicidade', {
      '2026-10-07': [{ id: 77, valor: -12.34 }],
    });

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01']);
    const stdout = result.stdout.replace(/\u00a0/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(stdout).toContain('Prefix');
    expect(stdout).toContain('Date');
    expect(stdout).toContain('Value');
    expect(stdout).toContain('Description');
    expect(stdout).toContain('Category');
    expect(stdout).toContain('Suggested description');
    expect(stdout).toContain('Tags');
    expect(stdout).toContain('Duplicate');
    expect(stdout).toContain('Action');
    expect(stdout).toContain('Padaria do Bairro');
    expect(stdout).toContain('Padaria Sugerida');
    expect(stdout).toContain('Alimentação/Mercado');
    expect(stdout).toContain('501, 502');
    expect(stdout).toContain('77');
    expect(stdout).toContain('skip');
    expect(stdout).toContain('-R$ 12,34');
    expect(stdout).toContain('2026-10-07');
    expect(stdout).toContain('Sem Nome');
    expect(stdout).toContain('999');
    expect(stdout).toContain('import');
    expect(stdout).not.toContain('Categoria Inventada');
    expect(stdout).not.toContain('Status');
    expect(stdout).not.toContain('"transactions"');
    expect(mutations(api)).toHaveLength(0);
  });
});
