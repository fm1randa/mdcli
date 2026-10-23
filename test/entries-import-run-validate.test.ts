import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank (9001), 1002 is Cartão Azul (9002, due 2026-01-16).
// Categories: 10 Alimentação (d), 20 Salário (r), 30 Transferência (t), 60 Antiga (d, inactive).
const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAO DE CREDITO', conta: 1002 },
    ],
  },
];
const INACTIVE = { ...CATEGORIES_RESPONSE.items[4], id: 60, nome: 'Antiga', nomeRel: 'Antiga', status: false };

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, INACTIVE] });
  api.on('GET /v1/lancamentos/duplicidade', {});
  entries([]);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[], connectionAccount = 9001) {
  api.on(`GET /v1/integracao/account/${connectionAccount}/transactions`, {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 0,
    lancamentos: rows,
  });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function run(args: string[], account = '1001') {
  return runCli(['entries', 'import', 'run', '-a', account, '--since', '2026-10-01', '--dry-run', ...args], { home, api });
}

async function plan(args: string[], account?: string) {
  const result = await run([...args, '--json'], account);
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  expect(mutations(api)).toHaveLength(0);
  return JSON.parse(result.stdout);
}

async function refused(args: string[]) {
  const result = await run(args);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(mutations(api)).toHaveLength(0);
  return result.stderr;
}

describe('entries import run category checks', () => {
  test('an inactive category is refused like entries create, even when every id would only be linked', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria' }]);

    const stderr = await refused(['--ids', 'aaaa', '-c', '60']);

    expect(stderr).toContain('Category "Antiga" (60) is inactive');
  });

  test('a transfer category or an unknown name fails', async () => {
    statement([bank(TX1)]);

    expect(await refused(['--ids', 'aaaa', '-c', '30'])).toContain('transfer category');
    expect(await refused(['--ids', 'aaaa', '-c', 'Nada'])).toContain('Unknown category: Nada');
  });

  test('the sign must match the category type, and the whole batch is reported at once', async () => {
    statement([bank(TX1, { valor: 12.34 }), bank(TX2, { valor: 0 })]);

    const expense = await refused(['--ids', 'aaaa,bbbb', '-c', '10']);
    expect(expense).toContain('aaaa1111: category "Alimentação" is an expense, so the value must be negative.');
    expect(expense).toContain('bbbb2222: the value is zero.');

    statement([bank(TX1)]);
    expect(await refused(['--ids', 'aaaa', '-c', '20'])).toContain('"Salário" is income, so the value must be positive');
  });
});

describe('entries import run actions', () => {
  test('the automatically linked Entry is conciliated, keeping its value and description', async () => {
    statement([bank(TX1, { _ca: { c: { d: { descricao: { v: 'Sugerida' } } } } })]);
    entries([{ id: 4242, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria do bairro', categoria: 40 }]);

    const body = await plan(['--ids', 'aaaa', '-c', '10']);

    expect(body.imported).toEqual([]);
    expect(body.conciliated).toEqual([
      {
        integrationId: TX1,
        prefix: 'aaaa1111',
        entryId: 4242,
        before: { value: -12.34, description: 'Padaria do bairro' },
        after: { value: -12.34, description: 'Padaria do bairro' },
      },
    ]);
  });

  test('the table shows the linked Entry before and after', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4242, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria do bairro' }]);

    const result = await run(['--ids', 'aaaa', '-c', '10']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Import 0, conciliate 1, reject 0, skip 0.');
    expect(result.stdout).toContain('4242');
    expect(result.stdout).toContain('Padaria do bairro');
    expect(result.stdout).toContain('Value before');
    expect(mutations(api)).toHaveLength(0);
  });

  test('of two entries within two days, --ids links the one the web picks: the day before comes first', async () => {
    statement([bank(TX1)]);
    entries([
      { id: 4242, dataPrevista: '2026-10-08', valor: -12.34 },
      { id: 4243, dataPrevista: '2026-10-06', valor: -12.34 },
    ]);

    const body = await plan(['--ids', 'aaaa', '-c', '10']);

    expect(body.imported).toEqual([]);
    expect(body.conciliated.map((item: { entryId: number }) => item.entryId)).toEqual([4243]);
  });

  test('a candidate outside the 2 days is not linked, and --ids imports beside it', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4244, dataPrevista: '2026-10-20', valor: -12.34 }]);

    const body = await plan(['--ids', 'aaaa', '-c', '10', '--search-to', '2026-10-20']);

    expect(body.conciliated).toEqual([]);
    expect(body.imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    const call = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(call?.query.get('fim')).toBe('2026-10-20');
    expect(api.requests.find((r) => r.path.endsWith('/transactions'))?.query.get('start')).toBe('2026-10-01');
  });

  test('a duplicate is skipped unless --include-duplicates, which imports it', async () => {
    statement([bank(TX1)]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const skipped = await plan(['--ids', 'aaaa', '-c', '10']);
    expect(skipped.skipped).toEqual([{ integrationId: TX1, prefix: 'aaaa1111', reason: 'duplicate' }]);
    expect(skipped.imported).toEqual([]);

    const included = await plan(['--ids', 'aaaa', '-c', '10', '--include-duplicates']);
    expect(included.skipped).toEqual([]);
    expect(included.imported.map((item: { integrationId: string }) => item.integrationId)).toEqual([TX1]);
  });

  test('--include-duplicates still links a duplicate that has a candidate', async () => {
    statement([bank(TX1)]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });
    entries([{ id: 77, dataEfetiva: '2026-10-07', valor: -12.34, descricao: 'Ja gravado' }]);

    const body = await plan(['--ids', 'aaaa', '-c', '10', '--include-duplicates']);

    expect(body.imported).toEqual([]);
    expect(body.conciliated.map((item: { entryId: number }) => item.entryId)).toEqual([77]);
  });
});

describe('entries import run status', () => {
  test('a future date is Scheduled and a past one Reconciled', async () => {
    statement([bank(TX1), bank(TX2, { data: '2099-01-05' })]);

    const body = await plan(['--ids', 'aaaa,bbbb', '-c', '10']);

    expect(body.imported.map((item: { status: string }) => item.status)).toEqual(['reconciled', 'scheduled']);
  });

  test('a past card purchase is Reconciled too, and --search-to on a card fails', async () => {
    statement([bank(TX1)], 9002);
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', { lancamentos: [], vencimento: '2026-01-16' });

    const body = await plan(['--ids', 'aaaa', '-c', '10'], '1002');
    expect(body.imported.map((item: { status: string }) => item.status)).toEqual(['reconciled']);

    const result = await run(['--ids', 'aaaa', '-c', '10', '--search-to', '2026-10-20'], '1002');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not specified');
    expect(mutations(api)).toHaveLength(0);
  });
});
