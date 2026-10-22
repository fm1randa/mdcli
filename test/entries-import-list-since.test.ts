import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }],
  },
];

const STATEMENT = {
  inicio: '2026-08-01',
  fim: '2026-08-10',
  saldo: 1,
  lancamentos: [
    {
      integrationId: '11111111-1111-4000-8000-000000000001',
      descricao: 'Movimento Ficticio',
      valor: -1,
      data: '2026-08-01',
    },
  ],
};

const EMPTY = {
  inicio: '2026-10-02',
  fim: '2026-10-18',
  saldo: 0,
  lancamentos: [],
};

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/integracao/account/9001/transactions', STATEMENT);
  api.on('GET /v1/lancamentos/duplicidade', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api, extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' } });
}

/** Local calendar arithmetic, independent of the production date helpers. */
function shiftDays(days: number): string {
  const now = new Date();
  const shifted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const year = String(shifted.getFullYear());
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function accountsWith(dataUltimoExtrato: string | undefined) {
  const [checking, card] = ACCOUNTS_RESPONSE.items;
  const { dataUltimoExtrato: _drop, ...rest } = checking;
  const account = dataUltimoExtrato === undefined ? rest : { ...rest, dataUltimoExtrato };
  return { ...ACCOUNTS_RESPONSE, items: [account, card] };
}

function startQuery(): string | null {
  const call = api.requests.find((r) => r.path.endsWith('/transactions'));
  return call?.query.get('start') ?? null;
}

describe('entries import list --since', () => {
  test('defaults to dataUltimoExtrato when that date is later than 90 days ago', async () => {
    const floor = shiftDays(-90);
    const today = shiftDays(0);
    expect(floor < '2026-10-01' && '2026-10-01' <= today).toBe(true);
    api.on('GET /v1/cadastros/contas', accountsWith('2026-10-01'));

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(startQuery()).toBe('2026-10-01');
    const body = JSON.parse(result.stdout);
    expect(body.since).toBe('2026-10-01');
    expect(body.statement.start).toBe('2026-08-01');
    expect(mutations(api)).toHaveLength(0);
  });

  test('uses the local day 90 days ago when dataUltimoExtrato is older', async () => {
    const floor = shiftDays(-90);
    api.on('GET /v1/cadastros/contas', accountsWith('2020-01-01'));

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

    expect(result.exitCode).toBe(0);
    expect(startQuery()).toBe(floor);
    expect(JSON.parse(result.stdout).since).toBe(floor);
    expect(JSON.parse(result.stdout).statement.start).toBe('2026-08-01');
    expect(mutations(api)).toHaveLength(0);
  });

  test('uses the local day 90 days ago when the account has no dataUltimoExtrato', async () => {
    const floor = shiftDays(-90);
    api.on('GET /v1/cadastros/contas', accountsWith(undefined));

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--json']);

    expect(result.exitCode).toBe(0);
    expect(startQuery()).toBe(floor);
    expect(JSON.parse(result.stdout).since).toBe(floor);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an explicit --since replaces the default, even when it is earlier than dataUltimoExtrato', async () => {
    api.on('GET /v1/cadastros/contas', accountsWith('2026-10-01'));

    const earlier = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-09-15', '--json']);
    expect(earlier.exitCode).toBe(0);
    expect(startQuery()).toBe('2026-09-15');
    expect(JSON.parse(earlier.stdout).since).toBe('2026-09-15');

    api.requests.length = 0;
    const later = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-15', '--json']);
    expect(later.exitCode).toBe(0);
    expect(startQuery()).toBe('2026-10-15');
    expect(JSON.parse(later.stdout).since).toBe('2026-10-15');
  });

  test('accepts --since on the earliest day and on today', async () => {
    const floor = shiftDays(-90);
    const today = shiftDays(0);

    const earliest = await cli(['entries', 'import', 'list', '-a', '1001', '--since', floor, '--json']);
    expect(earliest.exitCode).toBe(0);
    expect(startQuery()).toBe(floor);

    api.requests.length = 0;
    const current = await cli(['entries', 'import', 'list', '-a', '1001', '--since', today, '--json']);
    expect(current.exitCode).toBe(0);
    expect(startQuery()).toBe(today);
    expect(JSON.parse(current.stdout).since).toBe(today);
  });

  test('rejects --since before the earliest day and does not load transactions', async () => {
    const floor = shiftDays(-90);
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2020-01-01', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: `The earliest start date is ${floor}. Bank transactions can only be loaded for the last 90 days.`,
    });
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('rejects a future --since and does not load transactions', async () => {
    const today = shiftDays(0);
    const tomorrow = shiftDays(1);
    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', tomorrow, '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: `The latest start date is today (${today}).`,
    });
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('rejects an invalid --since and does not load transactions', async () => {
    for (const since of ['2026-02-31', '2026-13-01', '22/10/2026', 'not-a-date']) {
      api.requests.length = 0;
      const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', since]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`Invalid date "${since}". Use YYYY-MM-DD (e.g., 2026-10-03).`);
      expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    }
    expect(mutations(api)).toHaveLength(0);
  });

  test('an empty statement exits 0, names the start, and keeps since in JSON', async () => {
    api.on('GET /v1/integracao/account/9001/transactions', EMPTY);

    const text = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01']);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe('');
    expect(text.stdout).toContain('No bank transactions since 2026-10-01.');
    expect(text.stdout).not.toContain('│');
    expect(text.stdout).not.toContain('Prefix');

    const json = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(json.stdout).not.toContain('No bank transactions');
    expect(JSON.parse(json.stdout)).toMatchObject({
      since: '2026-10-01',
      statement: { start: '2026-10-02', end: '2026-10-18', balance: 0 },
      search: { from: '2026-09-30', to: '2026-10-20' },
      ai: 'unused',
      transactions: [],
    });
    expect(mutations(api)).toHaveLength(0);
  });
});
