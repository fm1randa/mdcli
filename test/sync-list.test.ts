import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 and 1002 are Nubank and Cartão Azul in the account fixture.
// 4242 is not in that registry. Connection 502 omits status; 9003 omits type;
// 9004 omits the linked Account (`conta`).
const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
    ],
  },
  {
    id: 502,
    accounts: [
      { id: 9003, conta: 4242 },
      { id: 9004 },
    ],
  },
];

const SYNC_LIST_JSON = {
  connections: [
    {
      id: 501,
      status: 'UPDATED',
      accounts: [
        { connectionAccount: 9001, accountId: 1001, accountName: 'Nubank', type: 'CONTA CORRENTE' },
        { connectionAccount: 9002, accountId: 1002, accountName: 'Cartão Azul', type: 'CARTAOCREDITO' },
      ],
    },
    {
      id: 502,
      status: null,
      accounts: [
        { connectionAccount: 9003, accountId: 4242, accountName: null, type: null },
        { connectionAccount: 9004, accountId: null, accountName: null, type: null },
      ],
    },
  ],
};

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('sync list', () => {
  test('prints the connections as JSON and only reads connections and the account registry', async () => {
    const result = await runCli(['sync', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.startsWith('{')).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual(SYNC_LIST_JSON);
    expect(api.requests.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      'GET /v1/cadastros/contas',
      'GET /v1/integracao/connections',
    ]);
    const accountsCall = api.requests.find((r) => r.path === '/v1/cadastros/contas');
    expect(accountsCall?.query.get('meta')).toBe('true');
    expect(accountsCall?.query.get('paginate')).toBe('false');
    expect(mutations(api)).toHaveLength(0);
  });

  test('prints one row per connection account, with the account name or that it has no account', async () => {
    const result = await runCli(['sync', 'list'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Connection');
    expect(result.stdout).toContain('Status');
    expect(result.stdout).toContain('Type');
    expect(result.stdout).toContain('Connection account');
    expect(result.stdout).toContain('Account');

    const lines = result.stdout.split('\n');
    const nubank = lines.find((line) => line.includes('9001'));
    const card = lines.find((line) => line.includes('9002'));
    const unknown = lines.find((line) => line.includes('9003'));
    const unlinked = lines.find((line) => line.includes('9004'));

    expect(nubank).toContain('501');
    expect(nubank).toContain('UPDATED');
    expect(nubank).toContain('CONTA CORRENTE');
    expect(nubank).toContain('Nubank');

    expect(card).toContain('501');
    expect(card).toContain('UPDATED');
    expect(card).toContain('CARTAOCREDITO');
    expect(card).toContain('Cartão Azul');

    expect(unknown).toContain('502');
    expect(unknown).not.toContain('UPDATED');
    expect(unknown).not.toContain('CONTA');
    expect(unknown).not.toContain('Nubank');
    expect(unknown).not.toContain('4242');

    expect(unlinked).toContain('502');
    expect(unlinked).toContain('No account');
    expect(result.stdout).not.toContain('"connections"');
  });

  test('without login, fails with the same message as the other commands and calls nothing', async () => {
    const loggedOut = createHome({});
    try {
      const text = await runCli(['sync', 'list'], { home: loggedOut, api });
      expect(text.exitCode).toBe(1);
      expect(text.stdout).toBe('');
      expect(text.stderr).toContain('Not authenticated. Run "mdcli auth login" first.');

      const json = await runCli(['sync', 'list', '--json'], { home: loggedOut, api });
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

  test('an API error names the method and path and prints nothing else on stdout', async () => {
    api.on('GET /v1/integracao/connections', { message: 'boom' }, 500);

    const json = await runCli(['sync', 'list', '--json'], { home, api });
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(JSON.parse(json.stderr)).toEqual({
      error: 'API request failed (GET /v1/integracao/connections): 500 Internal Server Error - {"message":"boom"}',
    });

    const text = await runCli(['sync', 'list'], { home, api });
    expect(text.exitCode).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain('✗ API request failed (GET /v1/integracao/connections): 500 Internal Server Error - {"message":"boom"}');
    expect(mutations(api)).toHaveLength(0);
  });

  test('rejects --connection and does not call the API', async () => {
    const result = await runCli(['sync', 'list', '--connection', '501'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("error: unknown option '--connection'");
    expect(result.stdout).toBe('');
    expect(api.requests).toHaveLength(0);
  });

  test('sync and sync list help are in American English', async () => {
    const sync = await runCli(['sync', '--help'], { home, api });
    expect(sync.exitCode).toBe(0);
    expect(sync.stdout).toContain('Usage: mdcli sync [options] [command]');
    expect(sync.stdout).toContain('List connections');
    expect(sync.stdout).toContain('List connections and the accounts linked to each one');
    expect(sync.stdout).not.toMatch(/conex[ãa]o|Listar|Atualizar|vincular/i);

    const list = await runCli(['sync', 'list', '--help'], { home, api });
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('Usage: mdcli sync list [options]');
    expect(list.stdout).toContain('List connections and the accounts linked to each one');
    expect(list.stdout).toContain('--json');
    expect(list.stdout).toContain('Output as JSON');
    expect(list.stdout).not.toContain('--connection');
    expect(list.stdout).not.toContain('--account');
    expect(list.stdout).not.toMatch(/conex[ãa]o|Listar|Atualizar|vincular/i);
  });
});
