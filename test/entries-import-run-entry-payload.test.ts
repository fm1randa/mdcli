import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement, SINCE } from './import-harness.js';

// The new Entry's payload in /lancamentos/importar, field by field as the web builds it.
// Fictional ids. 1001 is Nubank (connection account 9001). Category 10 is Alimentação (d).

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX3 = 'cccc3333-3333-4000-8000-000000000003';

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

describe('entries import run: the new Entry payload', () => {
  test('a future date is Scheduled, with the reminder the web turns on: not confirmed, no effective date or value', async () => {
    statement([bank(TX1, { data: '2099-01-05' })]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.exitCode).toBe(0);
    const [, , importing] = mutations(api);
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([
      {
        integrationId: TX1,
        moeda: 1,
        descricao: 'Padaria Ficticia',
        conta: 1001,
        categoria: 10,
        tags: [],
        tipo: 'd',
        confirmado: false,
        conciliado: false,
        dataPrevista: '2099-01-05',
        dataCompetencia: '2099-01-05',
        valorPrevisto: -12.34,
        lembrete: '0',
        enviarLembrete: true,
      },
    ]);
  });

  test('a card Entry takes the bank date as dataCompetencia, without dataPrevista or dataEfetiva', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 502, status: 'UPDATED', accounts: [{ id: 9002, type: 'CARTAO DE CREDITO', conta: 1002 }] },
    ]);
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', { lancamentos: [] });
    api.on('GET /v1/integracao/account/9002/transactions', {
      inicio: '2026-10-01',
      fim: '2026-10-10',
      saldo: -40,
      lancamentos: [bank(TX1, { nomePlastico: 'FICTICIO' }), bank(TX3, { data: '2099-02-01', valor: -3 })],
    });

    const result = await runCli(
      ['entries', 'import', 'run', '-a', '1002', '--since', SINCE, '--ids', 'aaaa,cccc', '-c', '10', '--yes', '--json'],
      { home, api },
    );

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    const [mark, , importing] = mutations(api);
    expect(mark.body).toEqual({ account: 9002, ids: [TX1, TX3], date: '2099-02-01' });
    const common = { moeda: 1, descricao: 'Padaria Ficticia', conta: 1002, categoria: 10, tags: [], tipo: 'd' };
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([
      {
        ...common,
        integrationId: TX1,
        nomePlastico: 'FICTICIO',
        confirmado: true,
        conciliado: true,
        dataCompetencia: '2026-10-07',
        valorPrevisto: -12.34,
        valorEfetivo: -12.34,
      },
      {
        ...common,
        integrationId: TX3,
        confirmado: false,
        conciliado: false,
        dataCompetencia: '2099-02-01',
        valorPrevisto: -3,
        lembrete: '0',
        enviarLembrete: true,
      },
    ]);
  });

  test("the bank's competence date, when it has one, is the Entry's dataCompetencia", async () => {
    statement([bank(TX1, { dataCompetencia: '2026-10-05' })]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.exitCode).toBe(0);
    const [, , importing] = mutations(api);
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([
      expect.objectContaining({ dataPrevista: '2026-10-07', dataCompetencia: '2026-10-05', dataEfetiva: '2026-10-07' }),
    ]);
  });
});
