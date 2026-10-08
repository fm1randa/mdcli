import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1001, name: 'nu' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function entriesQuery(): URLSearchParams {
  const request = api.requests.find((r) => r.path === '/v2/lancamentos');
  if (!request) throw new Error('entries endpoint was not called');
  return request.query;
}

describe('entries list', () => {
  test('turns status and type names into the API bitmasks', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', '1001', '-s', 'pending,reconciled', '-T', 'expense,income', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(entriesQuery().get('status')).toBe('5');
    expect(entriesQuery().get('tipoLancamento')).toBe('3');
  });

  test('resolves account aliases and category names', async () => {
    const result = await runCli(
      ['entries', 'list', '-a', 'nu', '-c', 'alimentação/mercado', '--from', '2026-01-01', '--to', '2026-01-31', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const query = entriesQuery();
    expect(JSON.parse(query.get('contas') ?? '')).toEqual({ faturas: true, ids: [1001] });
    expect(JSON.parse(query.get('categorias') ?? '')).toEqual({ ids: ['11'] });
    expect(query.get('inicio')).toBe('2026-01-01');
    expect(query.get('fim')).toBe('2026-01-31');
  });

  test('rejects an unknown status name before calling the API', async () => {
    const result = await runCli(['entries', 'list', '-a', '1001', '-s', 'done'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown status: done');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
  });

  test('rejects an unknown account', async () => {
    const result = await runCli(['entries', 'list', '-a', 'nope'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown account(s): nope');
  });
});

describe('entries create', () => {
  const created = { id: 9, descricao: 'x', valor: -10, data: '2026-01-05', status: 'conciliado' };

  test('sends expenses as negative values and omits dataCompetencia on a regular account', async () => {
    api.on('POST /v1/lancamentos', created);

    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Mercado', '-v', '10', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const body = mutations(api)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ conta: '1001', categoria: 10, tipo: 'd', valor: -10, dataEfetiva: '2026-01-05' });
    expect(body).not.toHaveProperty('dataCompetencia');
  });

  test('adds dataCompetencia on a credit card account', async () => {
    api.on('POST /v1/lancamentos', created);

    const result = await runCli(
      ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(mutations(api)[0].body).toMatchObject({ dataCompetencia: '2026-01-05' });
  });

  test('requires a category', async () => {
    const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-v', '10'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(mutations(api)).toHaveLength(0);
  });
});
