import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement, SINCE, type BankTransaction } from './import-harness.js';

// Fictional ids. 201 is Conta Teste. 301 is its connection account, not the Account id.

const EXPENSE_ID = 'eeeeeeee-1111-4000-8000-000000000001';
const INCOME_ID = 'eeeeeeee-2222-4000-8000-000000000002';
const ZERO_ID = 'ffffffff-1111-4000-8000-000000000001';
const TRANSFER_ID = 'ffffffff-2222-4000-8000-000000000002';

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

function statement(rows: BankTransaction[]) {
  mockStatement(api, rows, { inicio: '2026-09-01', fim: '2026-10-31', saldo: 10 });
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
            d: { categoria: { v: '11' } },
            r: { categoria: { v: '20' } },
            t: { categoria: { v: '30' } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.ai).toBe('unused');
    expect(body.account).toEqual({ id: 201, name: 'Conta Teste' });
    expect(body.transactions).toEqual([
      {
        id: 'eeeeeeee',
        integrationId: EXPENSE_ID,
        date: '2026-10-07',
        value: -12.34,
        bankDescription: 'Padaria do Bairro',
        description: 'Padaria do Bairro',
        suggestedDescription: null,
        suggestedTagIds: [],
        suggestedCategory: { id: 11, name: 'Alimentação/Mercado', source: 'rule' },
        category: '11',
        duplicateOf: null,
        entry: null,
        alreadyConciliated: false,
        candidates: [],
        action: 'import',
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
            d: { categoria: { v: '11' } },
            r: { categoria: { v: '20' } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).transactions).toEqual([
      {
        id: 'eeeeeeee',
        integrationId: INCOME_ID,
        date: '2026-10-08',
        value: 8.5,
        bankDescription: 'Credito Ficticio',
        description: 'Credito Ficticio',
        suggestedDescription: null,
        suggestedTagIds: [],
        suggestedCategory: { id: 20, name: 'Salário', source: 'rule' },
        category: '20',
        duplicateOf: null,
        entry: null,
        alreadyConciliated: false,
        candidates: [],
        action: 'import',
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
            d: { categoria: { v: '11' }, descricao: { v: 'Nao Esta' }, tags: { v: 501 } },
            r: { categoria: { v: '20' } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.suggestedCategory).toBeNull();
    expect(row.suggestedDescription).toBe('Texto do Zero');
    expect(row.suggestedTagIds).toEqual([]);
    expect(row.bankDescription).toBe('Ajuste Zerado');
    expect(row.description).toBe('Texto do Zero');
    expect(row.category).toBeNull();
    expect(row.action).toBe('import');
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
            d: { categoria: { v: '11' }, descricao: { v: 'Despesa' }, tags: { v: 501 } },
            t: { categoria: { v: '30' }, descricao: { v: 'Transferencia Sugerida' }, tags: { v: [502] } },
          },
        },
      },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.suggestedCategory).toEqual({ id: 30, name: 'Transferência', source: 'rule' });
    expect(row.suggestedDescription).toBe('Transferencia Sugerida');
    expect(row.suggestedTagIds).toEqual([502]);
    expect(row.bankDescription).toBe('Ted Ficticia');
    expect(row.description).toBe('Transferencia Sugerida');
    expect(row.action).toBe('import');
    expect(mutations(api)).toHaveLength(0);
  });
});
