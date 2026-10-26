import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';
import { SINCE } from './import-harness.js';

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
  return runCli(args, { home, api });
}

function calledTransactions(): boolean {
  return api.requests.some((r) => r.path.includes('/transactions'));
}

describe('entries import list errors', () => {
  test('an account outside every connection fails without loading transactions', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9002, type: 'CARTAOCREDITO', conta: 1002 }] },
    ]);

    const text = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE]);
    expect(text.exitCode).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain('Account 1001 is not linked to any connection.');
    expect(calledTransactions()).toBe(false);

    const json = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(JSON.parse(json.stderr)).toEqual({ error: 'Account 1001 is not linked to any connection.' });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('an account on more than one connection fails without loading transactions or writing', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 501, accounts: [{ id: 9001, conta: 1001 }] },
      { id: 502, accounts: [{ id: 9009, conta: 1001 }] },
    ]);

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Account 1001 is linked to more than one connection (501, 502).',
    });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.some((r) => r.path.includes('/regras') || r.path.includes('smartmatch'))).toBe(false);
  });

  // Each connection answer the CLI cannot place the account in fails before reading the statement.
  const unplaceable: [string, object, string][] = [
    [
      'a connections answer that is not a list',
      { items: ONE_LINK },
      'GET /v1/integracao/connections did not return a list of connections',
    ],
    [
      'a connection without an id',
      [{ status: 'UPDATED', accounts: [{ id: 9001, conta: 1001 }] }],
      'Account 1001 is linked to a connection that did not include its id.',
    ],
    [
      'an account linked twice on one connection',
      [{ id: 501, accounts: [{ id: 9001, conta: 1001 }, { id: 9003, conta: 1001 }] }],
      'Account 1001 is linked twice on connection 501 (9001, 9003).',
    ],
    [
      'a link without the connection account id',
      [{ id: 501, accounts: [{ type: 'CONTA CORRENTE', conta: 1001 }] }],
      'Account 1001 is linked to connection 501, which did not include its connection account id.',
    ],
  ];
  for (const [name, connections, error] of unplaceable) {
    test(`${name} fails without loading transactions or writing`, async () => {
      api.on('GET /v1/integracao/connections', connections);

      const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr)).toEqual({ error });
      expect(calledTransactions()).toBe(false);
      expect(mutations(api)).toHaveLength(0);
    });
  }

  test('an unknown account fails before transactions', async () => {
    const result = await cli(['entries', 'import', 'list', '-a', 'nope', '--since', SINCE, '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'Unknown account: nope' });
    expect(calledTransactions()).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('without login, fails with the same message as the other commands and calls nothing', async () => {
    const loggedOut = createHome({});
    try {
      const text = await runCli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE], {
        home: loggedOut,
        api,
      });
      expect(text.exitCode).toBe(1);
      expect(text.stdout).toBe('');
      expect(text.stderr).toContain('Not authenticated. Run "mdcli auth login" first.');

      const json = await runCli(['entries', 'import', 'list', '-a', '1001', '--json'], {
        home: loggedOut,
        api,
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

    const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const body = JSON.parse(result.stderr) as { error: string };
    expect(body.error).toContain(`API request failed (GET /v1/integracao/account/9001/transactions?start=${SINCE})`);
    expect(body.error).toContain('500');
    expect(mutations(api)).toHaveLength(0);
  });
});
