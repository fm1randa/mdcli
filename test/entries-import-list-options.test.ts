import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, SINCE } from './import-harness.js';

// Fictional ids. 201 is Conta Teste and 202 is Cartão Teste in the account fixture.
// connection account 301 is not the Meu Dinheiro account id.

const LONE = 'bbbbbbbb-1111-4000-8000-000000000001';
const SHARED_A = 'aaaaaaaa-1111-4000-8000-000000000001';
const SHARED_B = 'aaaaaaaa-2222-4000-8000-000000000002';
const CASE_A = 'CCCCCCCC-1111-4000-8000-000000000001';
const CASE_B = 'cccccccc-2222-4000-8000-000000000002';
const FULL_A = 'abcdef12-1111-4000-8000-00000000000a';
const FULL_B = 'abcdef12-1111-4000-8000-00000000000b';
const MISSING = 'dddddddd-1111-4000-8000-000000000001';

const STATEMENT = {
  inicio: '2026-10-02',
  fim: '2026-10-18',
  saldo: 42.5,
  lancamentos: [
    {
      integrationId: LONE,
      descricao: 'Padaria Ficticia',
      valor: -12.34,
      data: '2026-10-07',
      moeda: 1,
      nomePlastico: 'Ficticio',
      status: 'conciliado',
      _ca: { d: 'Descricao Sugerida', c: { d: { categoria: { v: '10' } } } },
    },
    { integrationId: SHARED_A, descricao: 'Credito Ficticio', valor: 8.5, data: '2026-10-08', moeda: 1 },
    { integrationId: SHARED_B, descricao: 'Taxi Ficticio', valor: -1, data: '2026-10-09', moeda: 1 },
    { integrationId: CASE_A, descricao: 'Cafe Ficticio', valor: -2, data: '2026-10-10', moeda: 1 },
    { integrationId: CASE_B, descricao: 'Lanche Ficticio', valor: -3, data: '2026-10-11', moeda: 1 },
    { integrationId: FULL_A, descricao: 'Onibus Ficticio', valor: -4, data: '2026-10-12', moeda: 1 },
    { integrationId: FULL_B, descricao: 'Metro Ficticio', valor: -5, data: '2026-10-13', moeda: 1 },
    { integrationId: MISSING, data: '2026-10-14', moeda: 1 },
  ],
};

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/integracao/account/301/transactions', STATEMENT);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 201, name: 'conta' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api });
}

describe('entries import list options', () => {
  test('help for entries import and entries import list offers the read options and calls no API', async () => {
    const parent = await cli(['entries', 'import', '--help']);
    expect(parent.exitCode).toBe(0);

    const list = await cli(['entries', 'import', 'list', '--help']);
    expect(list.exitCode).toBe(0);
    for (const option of ['--account', '--since', '--json', '--search-from', '--search-to']) {
      expect(list.stdout).toContain(option);
    }
    expect(list.stdout).not.toContain('--yes');
    expect(api.requests).toHaveLength(0);
  });

  test('accepts --search-from and --search-to, and rejects an invalid search date before calling the API', async () => {
    const widened = await cli([
      'entries', 'import', 'list', '-a', '201', '--since', SINCE, '--json',
      '--search-from', '2026-09-01', '--search-to', '2026-10-25',
    ]);
    expect(widened.exitCode).toBe(0);
    expect(JSON.parse(widened.stdout).search).toEqual({ from: '2026-09-01', to: '2026-10-25' });
    const found = api.requests.filter((r) => r.path === '/v2/lancamentos');
    expect(found).toHaveLength(1);
    expect(found[0].query.get('inicio')).toBe('2026-09-01');
    expect(found[0].query.get('fim')).toBe('2026-10-25');

    api.requests.length = 0;
    for (const flag of ['--search-from', '--search-to']) {
      const bad = await cli(['entries', 'import', 'list', '-a', '201', flag, '2026-02-31', '--json']);
      expect(bad.exitCode).toBe(1);
      expect(bad.stdout).toBe('');
      expect(JSON.parse(bad.stderr)).toEqual({
        error: 'Invalid date "2026-02-31". Use YYYY-MM-DD (e.g., 2026-10-03).',
      });
      expect(api.requests).toHaveLength(0);
    }

    const backwards = await cli([
      'entries', 'import', 'list', '-a', '201', '--json',
      '--search-from', '2026-10-20', '--search-to', '2026-10-01',
    ]);
    expect(backwards.exitCode).toBe(1);
    expect(backwards.stdout).toBe('');
    expect(JSON.parse(backwards.stderr)).toEqual({
      error: 'Search start 2026-10-20 is after search end 2026-10-01.',
    });
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('requires --account and does not call the API', async () => {
    const result = await cli(['entries', 'import', 'list', '--since', SINCE]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("required option '-a, --account <identifier>'");
    expect(api.requests).toHaveLength(0);
  });
});
