import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank. 9001 is its connection account, not the Account id.
// Spec window for inicio 2026-10-01 and fim 2026-10-10 is 2026-09-29 through 2026-10-12.
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];

const TX = '12121212-1111-4000-8000-000000000001';

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

function bank(extra: Record<string, unknown> = {}) {
  return {
    integrationId: TX,
    descricao: 'Pagamento Ficticio',
    valor: -12.34,
    data: '2026-10-07',
    moeda: 1,
    _ca: { c: { d: { categoria: { v: 10 } } } },
    ...extra,
  };
}

function statement(rows: unknown[], extra: Record<string, unknown> = {}) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 0,
    lancamentos: rows,
    ...extra,
  });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function list(args: string[] = []) {
  return cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json', ...args]);
}

function rowOf(stdout: string) {
  return JSON.parse(stdout).transactions[0] as {
    candidates: { id: number; date: string; value: number; description: string | null; categoryId: number | null }[];
    defaultAction: string;
    duplicateOf: number | null;
    search?: unknown;
  };
}

describe('entries import list candidates', () => {
  test('leaves entry 4242 on 2026-10-20 out of the default window', async () => {
    statement([bank()]);
    entries([{ id: 4242, dataPrevista: '2026-10-20', valor: -12.34 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.search).toEqual({ from: '2026-09-29', to: '2026-10-12' });
    expect(body.ai).toBe('unused');
    expect(body.transactions[0].candidates).toEqual([]);
    expect(body.transactions[0].defaultAction).toBe('import');
    const call = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(call?.query.get('inicio')).toBe('2026-09-29');
    expect(call?.query.get('fim')).toBe('2026-10-12');
    expect(mutations(api)).toHaveLength(0);
  });

  test('includes 4242 when --search-to is 2026-10-20 and does not conciliate it', async () => {
    statement([bank()]);
    entries([{ id: 4242, dataPrevista: '2026-10-20', valor: -12.34 }]);

    const result = await list(['--search-to', '2026-10-20']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.search).toEqual({ from: '2026-09-29', to: '2026-10-20' });
    expect(body.transactions[0].candidates).toEqual([
      { id: 4242, date: '2026-10-20', value: -12.34, description: null, categoryId: null },
    ]);
    expect(body.transactions[0].defaultAction).toBe('import');
    const call = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(call?.query.get('inicio')).toBe('2026-09-29');
    expect(call?.query.get('fim')).toBe('2026-10-20');
    expect(mutations(api)).toHaveLength(0);
  });

  test('--search-from replaces only the start', async () => {
    statement([bank()]);
    entries([{ id: 4244, dataPrevista: '2026-09-20', valor: -12.34, descricao: 'Antes', categoria: 10 }]);

    const absent = await list();
    expect(JSON.parse(absent.stdout).search).toEqual({ from: '2026-09-29', to: '2026-10-12' });
    expect(JSON.parse(absent.stdout).transactions[0].candidates).toEqual([]);

    const widened = await list(['--search-from', '2026-09-15']);
    expect(widened.exitCode).toBe(0);
    const body = JSON.parse(widened.stdout);
    expect(body.search).toEqual({ from: '2026-09-15', to: '2026-10-12' });
    expect(body.transactions[0].candidates).toEqual([
      { id: 4244, date: '2026-09-20', value: -12.34, description: 'Antes', categoryId: 10 },
    ]);
    expect(body.transactions[0].defaultAction).toBe('import');
    const calls = api.requests.filter((r) => r.path === '/v2/lancamentos');
    expect(calls.at(-1)?.query.get('inicio')).toBe('2026-09-15');
    expect(calls.at(-1)?.query.get('fim')).toBe('2026-10-12');
  });

  test('conciliates an entry on 2026-10-09 even when duplicateOf is set', async () => {
    statement([bank()]);
    entries([{ id: 4309, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria', categoria: 10 }]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = rowOf(result.stdout);
    expect(row.duplicateOf).toBe(77);
    expect(row.defaultAction).toBe('conciliate');
    expect(row.candidates).toEqual([
      { id: 4309, date: '2026-10-09', value: -12.34, description: 'Padaria', categoryId: 10 },
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('conciliates an entry on 2026-10-05', async () => {
    statement([bank()]);
    entries([{ id: 4305, dataPrevista: '2026-10-05', valor: -12.34, descricao: 'Mercado', categoria: 11 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = rowOf(result.stdout);
    expect(row.defaultAction).toBe('conciliate');
    expect(row.candidates).toEqual([
      { id: 4305, date: '2026-10-05', value: -12.34, description: 'Mercado', categoryId: 11 },
    ]);
  });

  test('lists an entry on 2026-10-04 inside the window without conciliating', async () => {
    statement([bank()]);
    entries([{ id: 4304, dataPrevista: '2026-10-04', valor: -12.34, descricao: 'Feira', categoria: 10 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.search).toEqual({ from: '2026-09-29', to: '2026-10-12' });
    expect(body.transactions[0].candidates).toEqual([
      { id: 4304, date: '2026-10-04', value: -12.34, description: 'Feira', categoryId: 10 },
    ]);
    expect(body.transactions[0].defaultAction).toBe('import');
  });

  test('conciliates two entries within two days and does not choose one', async () => {
    statement([bank()]);
    entries([
      { id: 5101, dataPrevista: '2026-10-07', valor: -12.34, descricao: 'Um', categoria: 10 },
      { id: 5102, dataPrevista: '2026-10-06', valor: -12.34, descricao: 'Dois', categoria: 11 },
    ]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.duplicateOf).toBe(77);
    expect(row.defaultAction).toBe('conciliate');
    expect(row.candidates).toEqual([
      { id: 5101, date: '2026-10-07', value: -12.34, description: 'Um', categoryId: 10 },
      { id: 5102, date: '2026-10-06', value: -12.34, description: 'Dois', categoryId: 11 },
    ]);
    expect(Object.keys(row).sort()).toEqual([
      'candidates', 'date', 'defaultAction', 'description', 'duplicateOf', 'integrationId',
      'prefix', 'suggestedCategory', 'suggestedDescription', 'suggestedTagIds', 'value',
    ]);
  });

  test('does not treat the opposite sign as a candidate', async () => {
    statement([bank()]);
    entries([{ id: 4901, dataPrevista: '2026-10-07', valor: 12.34, descricao: 'Estorno', categoria: 20 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(rowOf(result.stdout).candidates).toEqual([]);
    expect(rowOf(result.stdout).defaultAction).toBe('import');
  });

  test('drops a candidate only when both document numbers are non-empty and differ', async () => {
    const cases = [
      { bankDoc: 'ABC', entryDoc: 'XYZ', kept: false },
      { bankDoc: 'abc', entryDoc: 'ABC', kept: false },
      { bankDoc: 'ABC', entryDoc: undefined, kept: true },
      { bankDoc: 'ABC', entryDoc: '', kept: true },
      { bankDoc: 'ABC', entryDoc: 'ABC', kept: true },
    ];
    for (const item of cases) {
      const entry: Record<string, unknown> = {
        id: 4600, dataPrevista: '2026-10-07', valor: -12.34, descricao: 'Doc', categoria: 10,
      };
      if (item.entryDoc !== undefined) entry.ndocumento = item.entryDoc;
      statement([bank({ ndocumento: item.bankDoc })]);
      entries([entry]);
      const result = await list();
      expect(result.exitCode).toBe(0);
      const row = rowOf(result.stdout);
      if (item.kept) {
        expect(row.candidates).toEqual([
          { id: 4600, date: '2026-10-07', value: -12.34, description: 'Doc', categoryId: 10 },
        ]);
        expect(row.defaultAction).toBe('conciliate');
      } else {
        expect(row.candidates).toEqual([]);
        expect(row.defaultAction).toBe('import');
      }
    }
    expect(mutations(api)).toHaveLength(0);
  });

  test('reads entry dates that carry a time as their calendar day', async () => {
    statement([bank()]);
    entries([
      { id: 6200, dataEfetiva: '2026-10-08T00:00:00', dataPrevista: '2026-10-01T00:00:00', valor: -12.34, descricao: 'Com hora' },
      { id: 6201, dataEfetiva: null, dataPrevista: '2026-10-11T00:00:00', valor: -12.34, descricao: 'Prevista', categoria: 10 },
    ]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = rowOf(result.stdout);
    expect(row.candidates).toEqual([
      { id: 6200, date: '2026-10-08', value: -12.34, description: 'Com hora', categoryId: null },
      { id: 6201, date: '2026-10-11', value: -12.34, description: 'Prevista', categoryId: 10 },
    ]);
    expect(row.defaultAction).toBe('conciliate');
  });

  test('uses dataEfetiva 2026-10-07 rather than dataPrevista 2026-10-01', async () => {
    statement([bank()]);
    entries([{
      id: 6100,
      dataEfetiva: '2026-10-07',
      dataPrevista: '2026-10-01',
      data: '2026-09-01',
      valor: -12.34,
      descricao: 'Efetiva',
      categoria: 10,
    }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = rowOf(result.stdout);
    expect(row.candidates).toEqual([
      { id: 6100, date: '2026-10-07', value: -12.34, description: 'Efetiva', categoryId: 10 },
    ]);
    expect(row.defaultAction).toBe('conciliate');
  });
});
