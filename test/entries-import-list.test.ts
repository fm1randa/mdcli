import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank and 1002 is Cartão Azul in the account fixture.
// connection account 9001 is not the Meu Dinheiro account id.
const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }],
  },
];

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
    candidates: [],
    defaultAction: 'needs-category',
  };
}

// Literals from the statement above, not from the production date helper.
// 2026-10-02 minus 2 days is 2026-09-30. 2026-10-18 plus 2 days is 2026-10-20.
const LIST_JSON = {
  account: { id: 1001, name: 'Nubank' },
  connection: { id: 501, connectionAccount: 9001 },
  since: '2026-10-01',
  statement: { start: '2026-10-02', end: '2026-10-18', balance: 42.5 },
  search: { from: '2026-09-30', to: '2026-10-20' },
  ai: 'unused',
  transactions: [
    tx(LONE, 'bbbbbbbb', '2026-10-07', -12.34, 'Padaria Ficticia'),
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
  return runCli(args, { home, api, extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' } });
}

const READS = [
  'GET /v1/cadastros/contas',
  'GET /v1/integracao/account/9001/transactions',
  'GET /v1/integracao/connections',
];

describe('entries import list', () => {
  test('prints the statement as JSON and only reads connections, accounts, and transactions', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trimStart().startsWith('{')).toBe(true);
    expect(result.stdout).not.toContain('│');
    expect(result.stdout).not.toContain('Prefix');
    expect(JSON.parse(result.stdout)).toEqual(LIST_JSON);
    expect(api.requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual(READS);
    const call = api.requests.find((r) => r.path.endsWith('/transactions'));
    expect(call?.query.get('start')).toBe('2026-10-01');
    expect([...(call?.query.keys() ?? [])]).toEqual(['start']);
    expect(mutations(api)).toHaveLength(0);
  });

  test('prints prefix, date, signed value, bank description, and the default action', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01']);
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
    expect(stdout).toContain('since 2026-10-01');
    expect(stdout).toContain('aaaaaaaa-1');
    expect(stdout).toContain('aaaaaaaa-2');
    expect(stdout).toContain('CCCCCCCC-1');
    expect(stdout).toContain(FULL_A);
    expect(stdout).not.toContain(LONE);
    expect(stdout).not.toContain(SHARED_A);
    expect(stdout).not.toContain('Descricao Sugerida');
    expect(stdout).not.toContain('Status');
    expect(stdout).not.toContain('Reconciled');
    expect(stdout).not.toContain('"transactions"');
    expect(mutations(api)).toHaveLength(0);
  });

  test('resolves an alias and an exact account name to the same connection account', async () => {
    const alias = await cli(['entries', 'import', 'list', '-a', 'nu', '--since', '2026-10-01', '--json']);
    expect(alias.exitCode).toBe(0);
    expect(JSON.parse(alias.stdout).account).toEqual({ id: 1001, name: 'Nubank' });

    const named = await cli(['entries', 'import', 'list', '-a', 'nubank', '--since', '2026-10-01', '--json']);
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

    const linked = await cli(['entries', 'import', 'list', '-a', '1002', '--since', '2026-10-01', '--json']);
    expect(linked.exitCode).toBe(0);
    expect(JSON.parse(linked.stdout).account).toEqual({ id: 1002, name: 'Cartão Azul' });
    expect(JSON.parse(linked.stdout).connection).toEqual({ id: 501, connectionAccount: 1001 });
    expect(api.requests.filter((r) => r.path.includes('/transactions')).map((r) => r.path)).toEqual([
      '/v1/integracao/account/1001/transactions',
    ]);

    api.requests.length = 0;
    const notTheConnectionAccount = await cli([
      'entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json',
    ]);
    expect(notTheConnectionAccount.exitCode).toBe(1);
    expect(notTheConnectionAccount.stdout).toBe('');
    expect(JSON.parse(notTheConnectionAccount.stderr)).toEqual({
      error: 'Account 1001 is not linked to a connection.',
    });
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('a duplicated connection row is still one link', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).connection).toEqual({ id: 501, connectionAccount: 9001 });
    expect(api.requests.filter((r) => r.path.includes('/transactions'))).toHaveLength(1);
  });

  test('help for entries import and entries import list is American English', async () => {
    const parent = await cli(['entries', 'import', '--help']);
    expect(parent.exitCode).toBe(0);
    expect(parent.stdout).toContain('Usage: mdcli entries import [options] [command]');
    expect(parent.stdout).toContain('List bank transactions');
    expect(parent.stdout).toContain('list');
    expect(parent.stdout).not.toMatch(/conex[ãa]o|lan[cç]amento|extrato|Listar|Importar/i);

    const list = await cli(['entries', 'import', 'list', '--help']);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('Usage: mdcli entries import list [options]');
    expect(list.stdout).toContain('--account');
    expect(list.stdout).toContain('--since');
    expect(list.stdout).toContain('--json');
    expect(list.stdout).toContain('Output as JSON');
    expect(list.stdout).not.toContain('--search-from');
    expect(list.stdout).not.toContain('--search-to');
    expect(list.stdout).not.toContain('--yes');
    expect(list.stdout).not.toMatch(/conex[ãa]o|lan[cç]amento|extrato|Listar|Importar/i);
    expect(api.requests).toHaveLength(0);
  });

  test('rejects --search-from and --search-to without calling the API', async () => {
    const from = await cli([
      'entries', 'import', 'list', '-a', '1001', '--search-from', '2026-09-01',
    ]);
    expect(from.exitCode).toBe(1);
    expect(from.stderr).toContain("unknown option '--search-from'");
    expect(from.stdout).toBe('');

    const to = await cli([
      'entries', 'import', 'list', '-a', '1001', '--search-to', '2026-10-20',
    ]);
    expect(to.exitCode).toBe(1);
    expect(to.stderr).toContain("unknown option '--search-to'");
    expect(api.requests).toHaveLength(0);
  });

  test('requires --account and does not call the API', async () => {
    const result = await cli(['entries', 'import', 'list', '--since', '2026-10-01']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("required option '-a, --account <identifier>'");
    expect(api.requests).toHaveLength(0);
  });
});
