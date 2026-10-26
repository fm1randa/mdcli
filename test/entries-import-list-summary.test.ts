import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, localDay, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { SINCE } from './import-harness.js';

// Fictional ids. 1001 is Nubank in the account fixture; 9001 is its connection account.
// Without --since the new Bank Transactions come from accounts[].summary of GET /integracao/connections,
// like the web's "Importar novos lançamentos" badge. Without a summary (a GET rarely has one: the web gets it
// from the sync PUT, which the CLI never sends on its own), the statement loads from the web's import dialog
// default, max(dataUltimoExtrato, today - 90). --since loads the statement from that date instead.

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

function startQueries(): (string | null)[] {
  return api.requests.filter((r) => r.path.endsWith('/transactions')).map((r) => r.query.get('start'));
}

/** The account fixture with some fields replaced; undefined removes the field. */
function accountsWith(extra: Record<string, unknown>): void {
  const items = ACCOUNTS_RESPONSE.items.map((item) => (item.id === 1001 ? { ...item, ...extra } : item));
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items });
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
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    const document = JSON.parse(result.stdout);
    expect(document.source).toBe('statement');
    expect(document.since).toBe(SINCE);
    expect(document.transactions.map((row: { integrationId: string }) => row.integrationId)).toEqual([OLD_ID, NEW_ID]);
    const call = api.requests.find((r) => r.path.endsWith('/transactions'));
    expect(call?.query.get('start')).toBe(SINCE);
  });

  for (const [name, summary] of [
    ['no summary', undefined],
    ['an empty summary', { inicio: '2026-10-21', fim: '2026-10-22', saldo: 1, lancamentos: [] }],
  ] as const) {
    test(`${name}: loads the statement since the account's last statement date, like the web's import button`, async () => {
      api.on('GET /v1/integracao/connections', connections(summary));
      const lastStatement = localDay(-3);
      accountsWith({ dataUltimoExtrato: `${lastStatement}T00:00:00` });

      const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      const document = JSON.parse(result.stdout);
      expect(document.source).toBe('statement');
      expect(document.since).toBe(lastStatement);
      expect(document.transactions.map((row: { integrationId: string }) => row.integrationId)).toEqual([OLD_ID, NEW_ID]);
      expect(startQueries()).toEqual([lastStatement]);
      expect(mutations(api)).toHaveLength(0);
    });
  }

  for (const [name, extra] of [
    ['a last statement more than 90 days ago', { dataUltimoExtrato: '2026-01-10' }],
    ['no last statement date', { dataUltimoExtrato: undefined }],
  ] as const) {
    test(`no summary and ${name}: loads the statement since 90 days ago`, async () => {
      api.on('GET /v1/integracao/connections', connections(undefined));
      accountsWith(extra);

      const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).since).toBe(localDay(-90));
      expect(startQueries()).toEqual([localDay(-90)]);
    });
  }

  test('no summary and an empty statement: nothing new since that date, pointing at an earlier --since', async () => {
    api.on('GET /v1/integracao/connections', connections(undefined));
    const lastStatement = localDay(-3);
    accountsWith({ dataUltimoExtrato: lastStatement });
    api.on('GET /v1/integracao/account/9001/transactions', { inicio: lastStatement, fim: localDay(0), saldo: 1, lancamentos: [] });

    const json = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);
    expect(json.exitCode).toBe(0);
    const document = JSON.parse(json.stdout);
    expect(document.source).toBe('statement');
    expect(document.since).toBe(lastStatement);
    expect(document.transactions).toEqual([]);

    const text = await cli(['entries', 'import', 'list', '-a', '1001']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain(`No bank transactions since ${lastStatement}.`);
    expect(text.stdout).toContain(`--since <YYYY-MM-DD> (${localDay(-90)} or later)`);
    expect(api.requests.some((r) => r.path === '/v1/smartmatch/ai')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an empty statement from 90 days ago does not suggest looking further back', async () => {
    api.on('GET /v1/integracao/connections', connections(undefined));
    api.on('GET /v1/integracao/account/9001/transactions', { inicio: null, fim: null, saldo: 1, lancamentos: [] });

    const text = await cli(['entries', 'import', 'list', '-a', '1001']);

    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain(`No bank transactions since ${localDay(-90)}.`);
    expect(text.stdout).not.toContain('--since');
  });

  test('import run with nothing new exits 0 without writing', async () => {
    api.on('GET /v1/integracao/connections', connections(undefined));
    api.on('GET /v1/integracao/account/9001/transactions', { inicio: null, fim: null, saldo: 1, lancamentos: [] });

    const json = await cli(['entries', 'import', 'run', '-a', '1001', '--edit', '--dry-run', '--json']);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    const run = JSON.parse(json.stdout);
    expect(run.imported).toEqual([]);
    expect(run.conciliated).toEqual([]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('import run without --since and without a summary imports from the statement since the last statement date', async () => {
    api.on('GET /v1/integracao/connections', connections(undefined));
    const lastStatement = localDay(-3);
    accountsWith({ dataUltimoExtrato: lastStatement });

    const result = await cli(['entries', 'import', 'run', '-a', '1001', '--ids', 'ffffffff', '-c', '10', '--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    const run = JSON.parse(result.stdout);
    expect(run.imported.map((item: { integrationId: string }) => item.integrationId)).toEqual([OLD_ID]);
    expect(startQueries()).toEqual([lastStatement]);
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
});
