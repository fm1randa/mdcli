import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank in the account fixture; 9001 is its connection account.
// Without --since the new Bank Transactions come from accounts[].summary of GET /integracao/connections,
// like the web's "Importar novos lançamentos" badge; --since loads the full statement instead.

const NEW_ID = 'eeeeeeee-1111-4000-8000-000000000001';
const OLD_ID = 'ffffffff-1111-4000-8000-000000000001';

const SUMMARY = {
  inicio: '2026-10-21',
  fim: '2026-10-22',
  saldo: 99.5,
  lancamentos: [{ integrationId: NEW_ID, descricao: 'Rendimento Ficticio', valor: 0.31, data: '2026-10-22', moeda: 1 }],
};

const STATEMENT = {
  inicio: '2026-10-01',
  fim: '2026-10-22',
  saldo: 99.5,
  lancamentos: [
    { integrationId: OLD_ID, descricao: 'Antigo Ficticio', valor: -3, data: '2026-10-05', moeda: 1 },
    ...SUMMARY.lancamentos,
  ],
};

function connections(summary: unknown) {
  const account: Record<string, unknown> = { id: 9001, type: 'CONTA CORRENTE', conta: 1001 };
  if (summary !== undefined) account.summary = summary;
  return [{ id: 501, status: 'UPDATED', accounts: [account] }];
}

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', connections(SUMMARY));
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/integracao/account/9001/transactions', STATEMENT);
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

function loadedStatement(): boolean {
  return api.requests.some((r) => r.path.endsWith('/transactions'));
}

describe('entries import list without --since: the new bank transactions', () => {
  test('lists the connection summary, with its period and balance as the statement, and does not load the full statement', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const document = JSON.parse(result.stdout);
    expect(document.source).toBe('summary');
    expect(document.since).toBeNull();
    expect(document.statement).toEqual({ start: '2026-10-21', end: '2026-10-22', balance: 99.5 });
    expect(document.search).toEqual({ from: '2026-10-19', to: '2026-10-24' });
    expect(document.transactions.map((row: { integrationId: string }) => row.integrationId)).toEqual([NEW_ID]);
    expect(loadedStatement()).toBe(false);
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(1);
    expect(mutations(api)).toHaveLength(0);
  });

  test('--since loads the full statement from that date, as the web manual import dialog does', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);

    expect(result.exitCode).toBe(0);
    const document = JSON.parse(result.stdout);
    expect(document.source).toBe('statement');
    expect(document.since).toBe('2026-10-01');
    expect(document.transactions.map((row: { integrationId: string }) => row.integrationId)).toEqual([OLD_ID, NEW_ID]);
    const call = api.requests.find((r) => r.path.endsWith('/transactions'));
    expect(call?.query.get('start')).toBe('2026-10-01');
  });

  for (const [name, summary] of [
    ['no summary', undefined],
    ['an empty summary', { inicio: '2026-10-21', fim: '2026-10-22', saldo: 1, lancamentos: [] }],
  ] as const) {
    test(`${name} means nothing new: an empty list that points at --since`, async () => {
      api.on('GET /v1/integracao/connections', connections(summary));

      const json = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);
      expect(json.exitCode).toBe(0);
      const document = JSON.parse(json.stdout);
      expect(document.source).toBe('summary');
      expect(document.transactions).toEqual([]);

      const text = await cli(['entries', 'import', 'list', '-a', '1001']);
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain('No new bank transactions');
      expect(text.stdout).toContain('--since');
      expect(loadedStatement()).toBe(false);
      expect(api.requests.some((r) => r.path === '/v1/smartmatch/ai')).toBe(false);
      expect(mutations(api)).toHaveLength(0);
    });
  }

  test('import run with nothing new exits 0 without writing', async () => {
    api.on('GET /v1/integracao/connections', connections(undefined));

    const text = await cli(['entries', 'import', 'run', '-a', '1001', '--ids', 'eeeeeeee', '-c', '20', '--yes']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('No new bank transactions');

    const json = await cli(['entries', 'import', 'run', '-a', '1001', '--edit', '--dry-run', '--json']);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    const run = JSON.parse(json.stdout);
    expect(run.imported).toEqual([]);
    expect(run.conciliated).toEqual([]);
    expect(loadedStatement()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('import run without --since imports from the summary', async () => {
    const result = await cli(['entries', 'import', 'run', '-a', '1001', '--ids', 'eeeeeeee', '-c', '20', '--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    const run = JSON.parse(result.stdout);
    expect(run.statement).toEqual({ start: '2026-10-21', end: '2026-10-22', balance: 99.5 });
    expect(run.imported.map((item: { integrationId: string }) => item.integrationId)).toEqual([NEW_ID]);
    expect(loadedStatement()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('help of list and run says where the transactions come from, how entries are linked, and that AI varies', async () => {
    for (const command of ['list', 'run']) {
      const help = await cli(['entries', 'import', command, '--help']);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain('Without --since, only the new bank transactions');
      expect(help.stdout).toContain('Reconciled entries are not listed as candidates');
      expect(help.stdout).toContain('AI suggestions come from the server and may differ between runs');
    }
    expect(api.requests).toHaveLength(0);
  });
});
