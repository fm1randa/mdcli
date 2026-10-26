import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, SINCE } from './import-harness.js';

// Fictional ids. 1001 is Nubank and 1002 is Cartão Azul in the account fixture.
// connection account 9001 is not the Meu Dinheiro account id.

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
      _ca: { d: 'Descricao Sugerida', c: { d: { categoria: { v: 10 } } } },
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

function tx(
  integrationId: string,
  prefix: string,
  date: string,
  value: number | null,
  description: string | null,
) {
  return {
    integrationId,
    prefix,
    date,
    value,
    description,
    suggestedDescription: null,
    suggestedTagIds: [],
    suggestedCategory: null,
    duplicateOf: null,
    conciliateWith: null,
    candidates: [],
    defaultAction: 'needs-category',
  };
}

// Literals from the statement above, not from the production date helper.
// 2026-10-02 minus 2 days is 2026-09-30. 2026-10-18 plus 2 days is 2026-10-20.
const LIST_JSON = {
  account: { id: 1001, name: 'Nubank' },
  connection: { id: 501, connectionAccount: 9001 },
  source: 'statement',
  since: SINCE,
  statement: { start: '2026-10-02', end: '2026-10-18', balance: 42.5 },
  search: { from: '2026-09-30', to: '2026-10-20' },
  ai: 'unused',
  transactions: [
    {
      ...tx(LONE, 'bbbbbbbb', '2026-10-07', -12.34, 'Padaria Ficticia'),
      suggestedDescription: 'Descricao Sugerida',
      suggestedCategory: { id: 10, name: 'Alimentação', source: 'rule' },
      defaultAction: 'import',
    },
    tx(SHARED_A, 'aaaaaaaa-1', '2026-10-08', 8.5, 'Credito Ficticio'),
    tx(SHARED_B, 'aaaaaaaa-2', '2026-10-09', -1, 'Taxi Ficticio'),
    tx(CASE_A, 'CCCCCCCC-1', '2026-10-10', -2, 'Cafe Ficticio'),
    tx(CASE_B, 'cccccccc-2', '2026-10-11', -3, 'Lanche Ficticio'),
    tx(FULL_A, FULL_A, '2026-10-12', -4, 'Onibus Ficticio'),
    tx(FULL_B, FULL_B, '2026-10-13', -5, 'Metro Ficticio'),
    tx(MISSING, 'dddddddd', '2026-10-14', null, null),
  ],
};

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/integracao/account/9001/transactions', STATEMENT);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1001, name: 'nu' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api });
}

const READS = [
  'GET /v1/cadastros/categorias',
  'GET /v1/cadastros/contas',
  'GET /v1/integracao/account/9001/transactions',
  'GET /v1/integracao/connections',
  'GET /v1/lancamentos/duplicidade',
  'GET /v2/lancamentos',
];

describe('entries import list', () => {
  test('prints the statement as JSON and only reads connections, accounts, transactions, categories, duplicates, and candidates', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trimStart().startsWith('{')).toBe(true);
    expect(result.stdout).not.toContain('│');
    expect(result.stdout).not.toContain('Prefix');
    expect(JSON.parse(result.stdout)).toEqual(LIST_JSON);
    expect(api.requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(READS);
    const call = api.requests.find((r) => r.path.endsWith('/transactions'));
    expect(call?.query.get('start')).toBe(SINCE);
    expect([...(call?.query.keys() ?? [])]).toEqual(['start']);
    const duplicates = api.requests.find((r) => r.path === '/v1/lancamentos/duplicidade');
    expect(duplicates?.query.get('inicio')).toBe('2026-10-07');
    expect(duplicates?.query.get('fim')).toBe('2026-10-14');
    expect(duplicates?.query.get('conta')).toBe('1001');
    const candidates = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(candidates?.method).toBe('GET');
    expect(candidates?.query.get('finalidade')).toBe('3');
    expect(candidates?.query.get('inicio')).toBe('2026-09-30');
    expect(candidates?.query.get('fim')).toBe('2026-10-20');
    expect(JSON.parse(candidates?.query.get('contas') ?? 'null')).toEqual({ ids: [1001] });
    expect(JSON.parse(candidates?.query.get('list') ?? 'null')).toEqual({ page: 1, pageSize: 500 });
    expect(mutations(api)).toHaveLength(0);
  });

  test('prints prefix, date, signed value, bank description, suggestion, and the default action', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE]);
    const stdout = result.stdout.replace(/\u00a0/g, ' ');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(stdout).toContain('Prefix');
    expect(stdout).toContain('Date');
    expect(stdout).toContain('Value');
    expect(stdout).toContain('Description');
    expect(stdout).toContain('Action');
    expect(stdout).toContain('Padaria Ficticia');
    expect(stdout).toContain('2026-10-07');
    expect(stdout).toContain('-R$ 12,34');
    expect(stdout).toContain('R$ 8,50');
    expect(stdout).toContain('needs-category');
    expect(stdout).toContain('import');
    expect(stdout).toContain('Category');
    expect(stdout).toContain('Suggested description');
    expect(stdout).toContain('Tags');
    expect(stdout).toContain('Duplicate');
    expect(stdout).toContain('Candidates');
    expect(stdout).toContain('Alimentação');
    expect(stdout).toContain('Descricao Sugerida');
    expect(stdout).toContain(`since ${SINCE}`);
    expect(stdout).toContain('aaaaaaaa-1');
    expect(stdout).toContain('aaaaaaaa-2');
    expect(stdout).toContain('CCCCCCCC-1');
    expect(stdout).toContain(FULL_A);
    expect(stdout).not.toContain(LONE);
    expect(stdout).not.toContain(SHARED_A);
    expect(stdout).not.toContain('Status');
    expect(stdout).not.toContain('Reconciled');
    expect(stdout).not.toContain('"transactions"');
    expect(mutations(api)).toHaveLength(0);
  });

  test('resolves an alias and an exact account name to the same connection account', async () => {
    const alias = await cli(['entries', 'import', 'list', '-a', 'nu', '--since', SINCE, '--json']);
    expect(alias.exitCode).toBe(0);
    expect(JSON.parse(alias.stdout).account).toEqual({ id: 1001, name: 'Nubank' });

    const named = await cli(['entries', 'import', 'list', '-a', 'nubank', '--since', SINCE, '--json']);
    expect(named.exitCode).toBe(0);
    expect(JSON.parse(named.stdout).account).toEqual({ id: 1001, name: 'Nubank' });
    const transactionPaths = api.requests.filter((r) => r.path.includes('/transactions')).map((r) => r.path);
    expect(transactionPaths).toEqual([
      '/v1/integracao/account/9001/transactions',
      '/v1/integracao/account/9001/transactions',
    ]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('uses conta as the account id and accounts[].id as the connection account', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 1001, type: 'CONTA CORRENTE', conta: 1002 }] },
    ]);
    api.on('GET /v1/integracao/account/1001/transactions', STATEMENT);
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
      lancamentos: [],
      vencimento: '2026-01-16',
      fechamento: '2026-01-08',
      valor: 0,
    });

    const linked = await cli(['entries', 'import', 'list', '-a', '1002', '--since', SINCE, '--json']);
    expect(linked.exitCode).toBe(0);
    expect(JSON.parse(linked.stdout).account).toEqual({ id: 1002, name: 'Cartão Azul' });
    expect(JSON.parse(linked.stdout).connection).toEqual({ id: 501, connectionAccount: 1001 });
    expect(api.requests.filter((r) => r.path.includes('/transactions')).map((r) => r.path)).toEqual([
      '/v1/integracao/account/1001/transactions',
    ]);
    const duplicates = api.requests.find((r) => r.path === '/v1/lancamentos/duplicidade');
    expect(duplicates?.query.get('conta')).toBe('1002');
    expect(api.requests.some((r) => r.path === '/v1/cartoes/1002/fatura/2026-01-16')).toBe(true);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(api.requests.some((r) => r.path.includes('primeiraFatura'))).toBe(false);

    api.requests.length = 0;
    const notTheConnectionAccount = await cli([
      'entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json',
    ]);
    expect(notTheConnectionAccount.exitCode).toBe(1);
    expect(notTheConnectionAccount.stdout).toBe('');
    expect(JSON.parse(notTheConnectionAccount.stderr)).toEqual({
      error: 'Account 1001 is not linked to any connection.',
    });
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('a duplicated connection row is still one link', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).connection).toEqual({ id: 501, connectionAccount: 9001 });
    expect(api.requests.filter((r) => r.path.includes('/transactions'))).toHaveLength(1);
  });

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
      'entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json',
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
      const bad = await cli(['entries', 'import', 'list', '-a', '1001', flag, '2026-02-31', '--json']);
      expect(bad.exitCode).toBe(1);
      expect(bad.stdout).toBe('');
      expect(JSON.parse(bad.stderr)).toEqual({
        error: 'Invalid date "2026-02-31". Use YYYY-MM-DD (e.g., 2026-10-03).',
      });
      expect(api.requests).toHaveLength(0);
    }

    const backwards = await cli([
      'entries', 'import', 'list', '-a', '1001', '--json',
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
