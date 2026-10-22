import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

const ONE_LINK = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }],
  },
];

const STATEMENT = {
  inicio: '2026-10-02',
  fim: '2026-10-18',
  saldo: 0,
  lancamentos: [],
};

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', ONE_LINK);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/integracao/account/9001/transactions', STATEMENT);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api, extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' } });
}

function calledTransactions(): boolean {
  return api.requests.some((r) => r.path.includes('/transactions'));
}

describe('entries import list errors', () => {
  test('an account outside every connection fails without loading transactions', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9002, type: 'CARTAOCREDITO', conta: 1002 }] },
    ]);

    const text = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01']);
    expect(text.exitCode).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain('Account 1001 is not linked to a connection.');
    expect(calledTransactions()).toBe(false);

    const json = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(JSON.parse(json.stderr)).toEqual({ error: 'Account 1001 is not linked to a connection.' });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an account on more than one connection fails without loading transactions or writing', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
      { id: 502, accounts: [{ id: 9009, conta: 1001 }] },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Account 1001 is linked to more than one connection.',
    });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.some((r) => r.path.includes('/regras') || r.path.includes('smartmatch'))).toBe(false);
  });

  test('an unknown account fails before transactions', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', 'nope', '--since', '2026-10-01', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'Unknown account: nope' });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('without login, fails with the same message as the other commands and calls nothing', async () => {
    const loggedOut = createHome({});
    try {
      const text = await runCli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01'], {
        home: loggedOut,
        api,
        extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' },
      });
      expect(text.exitCode).toBe(1);
      expect(text.stdout).toBe('');
      expect(text.stderr).toContain('Not authenticated. Run "mdcli auth login" first.');

      const json = await runCli(['entries', 'import', 'list', '-a', '1001', '--json'], {
        home: loggedOut,
        api,
        extraEnv: { MDCLI_NO_AUTO_UPDATE: '1' },
      });
      expect(json.exitCode).toBe(1);
      expect(json.stdout).toBe('');
      expect(JSON.parse(json.stderr)).toEqual({
        error: 'Not authenticated. Run "mdcli auth login" first.',
      });
      expect(api.requests).toHaveLength(0);
    } finally {
      loggedOut.cleanup();
    }
  });

  test('an API error names the method and path and does not write', async () => {
    api.on('GET /v1/integracao/account/9001/transactions', { message: 'boom' }, 500);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', '2026-10-01', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const body = JSON.parse(result.stderr) as { error: string };
    expect(body.error).toContain('API request failed (GET /v1/integracao/account/9001/transactions?start=2026-10-01)');
    expect(body.error).toContain('500');
    expect(mutations(api)).toHaveLength(0);
  });
});
