import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, type MockApi, type TestHome } from './helpers.js';
import { AFTER_SYNC, ONE_CONNECTION, openSyncRun, type SyncRun } from './sync-run-harness.js';

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

describe('sync run', () => {
  test('requests a Sync for the account connection and prints that connection from the GET after the PUT', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const result = await runCli(['sync', 'run', '1001', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith('{')).toBe(true);
    expect(result.stdout).not.toContain('Run sync list again');
    expect(result.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(JSON.parse(result.stdout)).toEqual({
      requested: true,
      connections: [
        {
          id: 501,
          status: 'UPDATING',
          accounts: [
            { connectionAccount: 9001, accountId: 1001, accountName: 'Nubank', type: 'CONTA CORRENTE' },
            { connectionAccount: 9002, accountId: 1002, accountName: 'Cartão Azul', type: 'CARTAOCREDITO' },
            { connectionAccount: 9003, accountId: 4242, accountName: null, type: null },
            { connectionAccount: 9004, accountId: null, accountName: null, type: null },
          ],
        },
      ],
    });

    const puts = api.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.path).toBe('/v1/integracao/connection/update/501');
    expect(puts[0]?.body).toEqual({ force: true });
    expect(puts[0]?.query.toString()).toBe('');
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/integracao/connections',
      'PUT /v1/integracao/connection/update/501',
      'GET /v1/integracao/connections',
      'GET /v1/cadastros/contas',
    ]);
    const accountsCall = api.requests.find((r) => r.path === '/v1/cadastros/contas');
    expect(accountsCall?.query.get('meta')).toBe('true');
    expect(accountsCall?.query.get('paginate')).toBe('false');
  });

  test('asks before the PUT, naming the connection and the daily limit, and y sends it', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const result = await runCli(['sync', 'run', '1001'], { home, api, stdin: 'y\n' });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Request a Sync for connection 501?');
    expect(result.stdout).toContain('Each connector accepts at most 3 Syncs per day.');
    expect(result.stdout).toContain('UPDATING');
    expect(result.stdout).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(result.stdout).toContain('Nubank');
    expect(result.stdout).toContain('Cartão Azul');
    expect(result.stdout).toContain('No account');
    expect(result.stdout).not.toContain('4242');
    expect(result.stdout).not.toContain('"requested"');
    expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/501']);
    expect(mutations(api)[0]?.body).toEqual({ force: true });
  });

  test('--yes skips the prompt and still sends the PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '1001', '--yes'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('3 Syncs per day');
    expect(result.stdout).not.toContain('Run sync list again');
    expect(result.stdout).toContain('UPDATED');
    expect(result.stdout).toContain('Nubank');
    expect(mutations(api)).toHaveLength(1);
  });

  test('any answer other than y cancels with no PUT and exit 0', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    for (const stdin of ['n\n', '\n', 'yes\n']) {
      api.requests.length = 0;
      const result = await runCli(['sync', 'run', '1001'], { home, api, stdin });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('501');
      expect(result.stdout).toContain('Each connector accepts at most 3 Syncs per day.');
      expect(result.stdout).toContain('Sync cancelled.');
      expect(mutations(api)).toHaveLength(0);
      expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
    }
  });

  test('--json without --yes fails before any request, even when stdin is y', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const result = await runCli(['sync', 'run', '1001', '--json'], { home, api, stdin: 'y\n' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'sync run --json requires --yes' });
    expect(api.requests).toHaveLength(0);
    expect(mutations(api)).toHaveLength(0);
  });

  test('two accounts on the same connection produce one PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '1002', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(mutations(api).map((r) => ({ path: r.path, body: r.body }))).toEqual([
      { path: '/v1/integracao/connection/update/501', body: { force: true } },
    ]);
    const doc = JSON.parse(result.stdout) as { connections: { accounts: { accountId: number | null }[] }[] };
    expect(doc.connections).toHaveLength(1);
    expect(doc.connections[0]?.accounts.map((account) => account.accountId)).toEqual([1001, 1002, 4242, null]);
  });

  test('an account outside every connection fails with no PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '1004', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'Account 1004 is not linked to any connection.' });
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
  });

  test('an account in more than one connection fails with no PUT', async () => {
    connections(
      [
        { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
        { id: 502, status: 'UPDATED', accounts: [{ id: 9006, type: 'CONTA CORRENTE', conta: 1001 }] },
      ],
      [],
    );

    const result = await runCli(['sync', 'run', '1001', '--yes'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Account 1001 is linked to more than one connection (501, 502).');
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
  });

  test('resolves an alias offline and an exact account name', async () => {
    const aliased = createHome({
      ...MANUAL_AUTH,
      aliases: { accounts: [{ id: 1002, name: 'azul' }], categories: [], tags: [] },
    });
    try {
      connections(ONE_CONNECTION, AFTER_SYNC);

      const alias = await runCli(['sync', 'run', 'azul', '--yes', '--json'], { home: aliased, api });
      expect(alias.exitCode).toBe(0);
      expect(alias.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
      expect(alias.stdout).not.toContain('Run sync list again');
      expect(api.requests[0]?.path).toBe('/v1/integracao/connections');
      expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/501']);
      expect(JSON.parse(alias.stdout).connections[0].id).toBe(501);

      api.requests.length = 0;
      const named = await runCli(['sync', 'run', 'nubank', '--yes', '--json'], { home, api });
      expect(named.exitCode).toBe(0);
      expect(api.requests[0]?.path).toBe('/v1/cadastros/contas');
      expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/501']);
      expect(JSON.parse(named.stdout).connections[0].status).toBe('UPDATING');
    } finally {
      aliased.cleanup();
    }
  });

  test('an unknown account name fails with no PUT and no connections GET', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', 'nope', '--yes'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unknown account: nope');
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/cadastros/contas']);
  });

  test('UPDATING exits 0, does not poll, and says to run sync list again', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const text = await runCli(['sync', 'run', '1001', '--yes'], { home, api });

    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe('');
    expect(text.stdout).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(2);

    api.requests.length = 0;
    connections(ONE_CONNECTION, AFTER_SYNC);
    const json = await runCli(['sync', 'run', '1001', '--yes', '--json'], { home, api });
    expect(json.exitCode).toBe(0);
    expect(json.stdout.startsWith('{')).toBe(true);
    expect(json.stdout).not.toContain('Run sync list again');
    expect(json.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(JSON.parse(json.stdout).connections[0].status).toBe('UPDATING');
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(2);
  });

  test('a failed PUT reports the API message and does not read status again', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);
    api.on('PUT /v1/integracao/connection/update/501', { message: 'limit' }, 500);

    const result = await runCli(['sync', 'run', '1001', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'API request failed (PUT /v1/integracao/connection/update/501): 500 Internal Server Error - {"message":"limit"}',
    });
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/integracao/connections',
      'PUT /v1/integracao/connection/update/501',
    ]);
  });

  test('does not keep a local count of the 3 syncs per day', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const first = await runCli(['sync', 'run', '1001', '--yes'], { home, api });
    const second = await runCli(['sync', 'run', '1001', '--yes'], { home, api });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(mutations(api).map((r) => r.body)).toEqual([{ force: true }, { force: true }]);
  });
});
