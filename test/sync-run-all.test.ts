import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_WITH_ALL, MANY_AFTER, MANY_CONNECTIONS, ONE_CONNECTION, openSyncRun, type SyncRun } from './sync-run-harness.js';

let api: MockApi;
let home: TestHome;
let connections: SyncRun['connections'];

beforeEach(() => {
  ({ api, home, connections } = openSyncRun());
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('sync run all', () => {
  test('updates each connection id once and does not resolve an account or alias named all', async () => {
    const aliased = createHome({
      ...MANUAL_AUTH,
      aliases: { accounts: [{ id: 1001, name: 'all' }], categories: [], tags: [] },
    });
    try {
      api.on('GET /v1/cadastros/contas', ACCOUNTS_WITH_ALL);
      connections(MANY_CONNECTIONS, MANY_AFTER);

      const result = await runCli(['sync', 'run', 'all', '--yes', '--json'], { home: aliased, api });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.startsWith('{')).toBe(true);
      expect(result.stdout).not.toContain('Run sync list again');
      expect(result.stderr).toContain('Connections 501, 502 are UPDATING. Run sync list again to see the result.');
      expect(JSON.parse(result.stdout)).toEqual({
        requested: true,
        connections: [
          {
            id: 501,
            status: 'UPDATING',
            accounts: [
              { connectionAccount: 9001, accountId: 1001, accountName: 'Nubank', type: 'CONTA CORRENTE' },
              { connectionAccount: 9002, accountId: 1002, accountName: 'Cartão Azul', type: 'CARTAOCREDITO' },
            ],
          },
          {
            id: 502,
            status: 'UPDATING',
            accounts: [
              { connectionAccount: 9003, accountId: 1009, accountName: 'all', type: 'CONTA CORRENTE' },
            ],
          },
        ],
      });
      expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET /v1/integracao/connections',
        'PUT /v1/integracao/connection/update/501',
        'PUT /v1/integracao/connection/update/502',
        'GET /v1/integracao/connections',
        'GET /v1/cadastros/contas',
      ]);
      expect(mutations(api).map((r) => r.body)).toEqual([{ force: true }, { force: true }]);

      api.requests.length = 0;
      connections(MANY_CONNECTIONS, MANY_AFTER);
      const cancelled = await runCli(['sync', 'run', 'all'], { home: aliased, api, stdin: 'n\n' });
      expect(cancelled.exitCode).toBe(0);
      expect(cancelled.stdout).toContain('Request a Sync for connections 501, 502?');
      expect(cancelled.stdout).toContain('Each connector accepts at most 3 Syncs per day.');
      expect(cancelled.stdout).toContain('Sync cancelled.');
      expect(mutations(api)).toHaveLength(0);
      expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
    } finally {
      aliased.cleanup();
    }
  });

  test('an account named all is synced by its numeric id, and ALL is a name, not every connection', async () => {
    api.on('GET /v1/cadastros/contas', ACCOUNTS_WITH_ALL);
    connections(MANY_CONNECTIONS, MANY_AFTER);

    const byId = await runCli(['sync', 'run', '1009', '--yes', '--json'], { home, api });

    expect(byId.exitCode).toBe(0);
    expect(byId.stderr).toContain('Connection 502 is UPDATING. Run sync list again to see the result.');
    expect(byId.stdout).not.toContain('Run sync list again');
    expect(JSON.parse(byId.stdout)).toEqual({
      requested: true,
      connections: [
        {
          id: 502,
          status: 'UPDATING',
          accounts: [
            { connectionAccount: 9003, accountId: 1009, accountName: 'all', type: 'CONTA CORRENTE' },
          ],
        },
      ],
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/integracao/connections',
      'PUT /v1/integracao/connection/update/502',
      'GET /v1/integracao/connections',
      'GET /v1/cadastros/contas',
    ]);

    api.requests.length = 0;
    const byName = await runCli(['sync', 'run', 'ALL', '--yes', '--json'], { home, api });
    expect(byName.exitCode).toBe(0);
    expect(api.requests[0]?.path).toBe('/v1/cadastros/contas');
    expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/502']);
    expect(JSON.parse(byName.stdout).connections.map((connection: { id: number }) => connection.id)).toEqual([502]);
  });

  test('stops after a failed PUT and names the connections already updated', async () => {
    const three = [
      { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
      { id: 502, status: 'UPDATED', accounts: [{ id: 9003, type: 'CONTA CORRENTE', conta: 1002 }] },
      { id: 504, status: 'UPDATED', accounts: [{ id: 9007, type: 'CONTA CORRENTE', conta: 1004 }] },
    ];
    connections(three, three);
    api.on('PUT /v1/integracao/connection/update/502', { message: 'limit' }, 500);

    const text = await runCli(['sync', 'run', 'all', '--yes'], { home, api });

    expect(text.exitCode).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain(
      'API request failed (PUT /v1/integracao/connection/update/502): 500 Internal Server Error - {"message":"limit"} Already updated: 501.',
    );
    expect(text.stderr).not.toContain('504');
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/integracao/connections',
      'PUT /v1/integracao/connection/update/501',
      'PUT /v1/integracao/connection/update/502',
    ]);

    api.requests.length = 0;
    connections(three, three);
    api.on('PUT /v1/integracao/connection/update/501', { message: 'limit' }, 500);
    const json = await runCli(['sync', 'run', 'all', '--yes', '--json'], { home, api });
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(JSON.parse(json.stderr)).toEqual({
      error: 'API request failed (PUT /v1/integracao/connection/update/501): 500 Internal Server Error - {"message":"limit"} Already updated: none.',
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/integracao/connections',
      'PUT /v1/integracao/connection/update/501',
    ]);
  });

  test('a single connection that fails still says nothing was updated', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);
    api.on('PUT /v1/integracao/connection/update/501', { message: 'limit' }, 500);

    const result = await runCli(['sync', 'run', 'all', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'API request failed (PUT /v1/integracao/connection/update/501): 500 Internal Server Error - {"message":"limit"} Already updated: none.',
    });
    expect(mutations(api)).toHaveLength(1);
  });

  test('no connections exits 0 without a prompt or a PUT', async () => {
    connections([], []);

    const text = await runCli(['sync', 'run', 'all'], { home, api });

    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('No connections to sync.');
    expect(text.stdout).not.toContain('3 Syncs per day');
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);

    api.requests.length = 0;
    connections([], []);
    const json = await runCli(['sync', 'run', 'all', '--yes', '--json'], { home, api });
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({ requested: true, connections: [] });
    expect(mutations(api)).toHaveLength(0);
  });

  test('without login, fails with the same message as the other commands and calls nothing', async () => {
    const loggedOut = createHome({});
    try {
      const text = await runCli(['sync', 'run', '1001', '--yes'], { home: loggedOut, api });
      expect(text.exitCode).toBe(1);
      expect(text.stdout).toBe('');
      expect(text.stderr).toContain('Not authenticated. Run "mdcli auth login" first.');

      const json = await runCli(['sync', 'run', 'all', '--yes', '--json'], { home: loggedOut, api });
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

  test('rejects --connection and a missing account before calling the API', async () => {
    const flag = await runCli(['sync', 'run', 'all', '--connection', '501', '--yes'], { home, api });
    expect(flag.exitCode).toBe(1);
    expect(flag.stderr).toContain("error: unknown option '--connection'");
    expect(flag.stdout).toBe('');

    const missing = await runCli(['sync', 'run', '--yes'], { home, api });
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe('');
    expect(api.requests).toHaveLength(0);
  });

  test('sync run help is in American English and offers no --connection', async () => {
    const run = await runCli(['sync', 'run', '--help'], { home, api });
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('--yes');
    expect(run.stdout).toContain('--json');
    expect(run.stdout).not.toContain('--connection');
    expect(run.stdout).not.toMatch(/conex[ãa]o|Listar|Atualizar|vincular/i);

    const sync = await runCli(['sync', '--help'], { home, api });
    expect(sync.exitCode).toBe(0);
    expect(sync.stdout).not.toMatch(/conex[ãa]o|Listar|Atualizar|vincular/i);
    expect(api.requests).toHaveLength(0);
  });
});
