import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, connections, mockStatement, SINCE } from './import-harness.js';

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  entries([]);
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[]) {
  mockStatement(api, rows, { saldo: 250.5 });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function run(args: string[], stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', SINCE, ...args], { home, api, stdin });
}

function routes(): string[] {
  return mutations(api).map((request) => `${request.method} ${request.path}`);
}

const COMMIT = [
  'POST /v1/integracao/transactions/markImported',
  'POST /v1/lancamentos/conciliacao',
  'POST /v1/lancamentos/importar',
];

describe('entries import run markImported', () => {
  test('a run that only conciliates marks the conciliated rows, like the web', async () => {
    statement([
      bank(TX1, { data: '2026-10-07' }),
      bank(TX2, { data: '2026-10-07', valor: -5, descricao: 'Farmacia Ficticia' }),
    ]);
    entries([
      { id: 4242, dataPrevista: '2026-10-07', valor: -12.34, descricao: 'Padaria do bairro' },
      { id: 4243, dataPrevista: '2026-10-07', valor: -5, descricao: 'Farmacia do bairro' },
    ]);

    const result = await run(['--ids', 'aaaa1111,bbbb2222', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    const [mark, conciliation, importing] = mutations(api);
    expect(mark.body).toEqual({ account: 9001, ids: [TX1, TX2], date: '2026-10-07' });
    expect((conciliation.body as { lancamentos: unknown[] }).lancamentos).toHaveLength(2);
    expect(importing.body).toMatchObject({ lancamentos: [], maxDate: '2026-10-07' });
    expect(JSON.parse(result.stdout).conciliated).toHaveLength(2);
  });

  test('marks every loaded row on the latest day, whatever the run does with it', async () => {
    statement([
      bank(TX1, { data: '2026-10-09', valor: -3 }),
      bank(TX2, { data: '2026-10-08' }),
      bank('cccc3333-3333-4000-8000-000000000003', { data: '2026-10-08', valor: -9 }),
    ]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-09': [{ id: 77, valor: -3 }] });
    entries([{ id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria do bairro' }]);

    const result = await run(['--ids', 'aaaa1111,bbbb2222,cccc3333', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const [mark, conciliation, importing] = mutations(api);
    expect(mark.body).toEqual({ account: 9001, ids: [TX1], date: '2026-10-09' });
    expect((conciliation.body as { maxDate: string }).maxDate).toBe('2026-10-09');
    expect((importing.body as { maxDate: string }).maxDate).toBe('2026-10-09');
  });

  test('a window of N days marks the rows from maxDate - N to maxDate, and none older', async () => {
    api.on('GET /v1/integracao/connections', connections(2));
    statement([
      bank(TX1, { data: '2026-10-10' }),
      bank(TX2, { data: '2026-10-09' }),
      bank('cccc3333-3333-4000-8000-000000000003', { data: '2026-10-08' }),
      bank('dddd4444-4444-4000-8000-000000000004', { data: '2026-10-07', valor: -4 }),
    ]);

    const result = await run(['--ids', 'aaaa1111,bbbb2222,cccc3333,dddd4444', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const [mark] = mutations(api);
    expect(mark.body).toEqual({
      account: 9001,
      ids: ['cccc3333-3333-4000-8000-000000000003', TX2, TX1],
      date: '2026-10-10',
    });
  });

  test('a window of 0 days marks only the rows on maxDate', async () => {
    api.on('GET /v1/integracao/connections', connections(0));
    statement([
      bank(TX1, { data: '2026-10-10' }),
      bank(TX2, { data: '2026-10-09' }),
      bank('cccc3333-3333-4000-8000-000000000003', { data: '2026-10-10', valor: -9 }),
    ]);

    const result = await run(['--ids', 'aaaa1111,bbbb2222,cccc3333', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const [mark] = mutations(api);
    expect(mark.body).toEqual({
      account: 9001,
      ids: [TX1, 'cccc3333-3333-4000-8000-000000000003'],
      date: '2026-10-10',
    });
  });

  test('a Connection without markImportedWindowDays marks the rows on maxDate, the window moment gets for a missing value', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
    ]);
    statement([bank(TX1, { data: '2026-10-10' }), bank(TX2, { data: '2026-10-09' })]);

    const result = await run(['--ids', 'aaaa1111,bbbb2222', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const [mark] = mutations(api);
    expect(mark.body).toEqual({ account: 9001, ids: [TX1], date: '2026-10-10' });
  });
});
