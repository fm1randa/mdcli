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

    const result = await runCli(['sync', 'run', '201', '--yes', '--json', '--timeout', '0'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith('{')).toBe(true);
    expect(result.stdout).not.toContain('Run sync list again');
    expect(result.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(JSON.parse(result.stdout)).toEqual({
      requested: true,
      timedOut: false,
      connections: [
        {
          id: 501,
          status: 'UPDATING',
          accounts: [
            { connectionAccount: 301, accountId: 201, accountName: 'Conta Teste', type: 'CONTA CORRENTE' },
            { connectionAccount: 302, accountId: 202, accountName: 'Cartão Teste', type: 'CARTAOCREDITO' },
            { connectionAccount: 303, accountId: 4242, accountName: null, type: null },
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

    const result = await runCli(['sync', 'run', '201', '--timeout', '0'], { home, api, stdin: 'y\n' });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Request a Sync for connection 501?');
    expect(result.stdout).toContain('Each connector accepts at most 3 Syncs per day.');
    expect(result.stdout).toContain('UPDATING');
    expect(result.stdout).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(result.stdout).toContain('Conta Teste');
    expect(result.stdout).toContain('Cartão Teste');
    expect(result.stdout).toContain('No account');
    expect(result.stdout).not.toContain('4242');
    expect(result.stdout).not.toContain('"requested"');
    expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/501']);
    expect(mutations(api)[0]?.body).toEqual({ force: true });
  });

  test('--yes skips the prompt and still sends the PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '201', '--yes'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('3 Syncs per day');
    expect(result.stdout).not.toContain('Run sync list again');
    expect(result.stdout).toContain('UPDATED');
    expect(result.stdout).toContain('Conta Teste');
    expect(mutations(api)).toHaveLength(1);
  });

  test('any answer other than y cancels with no PUT and exit 0', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    for (const stdin of ['n\n', '\n', 'yes\n']) {
      api.requests.length = 0;
      const result = await runCli(['sync', 'run', '201'], { home, api, stdin });
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

    const result = await runCli(['sync', 'run', '201', '--json'], { home, api, stdin: 'y\n' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'sync run --json requires --yes' });
    expect(api.requests).toHaveLength(0);
    expect(mutations(api)).toHaveLength(0);
  });

  test('two accounts on the same connection produce one PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '202', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(mutations(api).map((r) => ({ path: r.path, body: r.body }))).toEqual([
      { path: '/v1/integracao/connection/update/501', body: { force: true } },
    ]);
    const doc = JSON.parse(result.stdout) as { connections: { accounts: { accountId: number | null }[] }[] };
    expect(doc.connections).toHaveLength(1);
    expect(doc.connections[0]?.accounts.map((account) => account.accountId)).toEqual([201, 202, 4242, null]);
  });

  test('an account outside every connection fails with no PUT', async () => {
    connections(ONE_CONNECTION, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '204', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'Account 204 is not linked to any connection.' });
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
  });

  test('an account in more than one connection fails with no PUT', async () => {
    connections(
      [
        { id: 501, status: 'UPDATED', accounts: [{ id: 301, type: 'CONTA CORRENTE', conta: 201 }] },
        { id: 502, status: 'UPDATED', accounts: [{ id: 9006, type: 'CONTA CORRENTE', conta: 201 }] },
      ],
      [],
    );

    const result = await runCli(['sync', 'run', '201', '--yes'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Account 201 is linked to more than one connection (501, 502).');
    expect(mutations(api)).toHaveLength(0);
    expect(api.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /v1/integracao/connections']);
  });

  test('resolves an alias offline and an exact account name', async () => {
    const aliased = createHome({
      ...MANUAL_AUTH,
      aliases: { accounts: [{ id: 202, name: 'cartao' }], categories: [], tags: [] },
    });
    try {
      connections(ONE_CONNECTION, AFTER_SYNC);

      const alias = await runCli(['sync', 'run', 'cartao', '--yes', '--json', '--timeout', '0'], { home: aliased, api });
      expect(alias.exitCode).toBe(0);
      expect(alias.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
      expect(alias.stdout).not.toContain('Run sync list again');
      expect(api.requests[0]?.path).toBe('/v1/integracao/connections');
      expect(mutations(api).map((r) => r.path)).toEqual(['/v1/integracao/connection/update/501']);
      expect(JSON.parse(alias.stdout).connections[0].id).toBe(501);

      api.requests.length = 0;
      const named = await runCli(['sync', 'run', 'Conta Teste', '--yes', '--json', '--timeout', '0'], { home, api });
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

  test('--timeout 0 exits 0 without polling and says to run sync list again', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const text = await runCli(['sync', 'run', '201', '--yes', '--timeout', '0'], { home, api });

    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe('');
    expect(text.stdout).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(2);

    api.requests.length = 0;
    connections(ONE_CONNECTION, AFTER_SYNC);
    const json = await runCli(['sync', 'run', '201', '--yes', '--json', '--timeout', '0'], { home, api });
    expect(json.exitCode).toBe(0);
    expect(json.stdout.startsWith('{')).toBe(true);
    expect(json.stdout).not.toContain('Run sync list again');
    expect(json.stderr).toContain('Connection 501 is UPDATING. Run sync list again to see the result.');
    expect(JSON.parse(json.stdout)).toEqual({
      requested: true,
      timedOut: false,
      connections: [
        {
          id: 501,
          status: 'UPDATING',
          accounts: [
            { connectionAccount: 301, accountId: 201, accountName: 'Conta Teste', type: 'CONTA CORRENTE' },
            { connectionAccount: 302, accountId: 202, accountName: 'Cartão Teste', type: 'CARTAOCREDITO' },
            { connectionAccount: 303, accountId: 4242, accountName: null, type: null },
            { connectionAccount: 9004, accountId: null, accountName: null, type: null },
          ],
        },
      ],
    });
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(2);
  });

  test('waits with progress until the connection reaches a final status', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC, AFTER_SYNC, ONE_CONNECTION);

    const result = await runCli(['sync', 'run', '201', '--yes', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Waiting up to 120s for connection 501 to finish the Sync...');
    expect(result.stderr).toContain('Still UPDATING after 1s: connection 501.');
    expect(result.stderr).toContain('Sync finished: connection 501 UPDATED.');
    expect(result.stderr).not.toContain('no final status');
    expect(JSON.parse(result.stdout)).toEqual({
      requested: true,
      timedOut: false,
      connections: [
        {
          id: 501,
          status: 'UPDATED',
          accounts: [
            { connectionAccount: 301, accountId: 201, accountName: 'Conta Teste', type: 'CONTA CORRENTE' },
            { connectionAccount: 302, accountId: 202, accountName: 'Cartão Teste', type: 'CARTAOCREDITO' },
            { connectionAccount: 303, accountId: 4242, accountName: null, type: null },
            { connectionAccount: 9004, accountId: null, accountName: null, type: null },
          ],
        },
      ],
    });
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections')).toHaveLength(4);
    expect(mutations(api)).toHaveLength(1);
  });

  test('does not announce a non-final status as finished', async () => {
    const cases = [
      { status: 'WAITING_USER_INPUT', expected: 'Connection 501 needs action: WAITING_USER_INPUT.' },
      { status: 'LOGIN_ERROR', expected: 'Sync failed for connection 501: LOGIN_ERROR.' },
    ] as const;

    for (const { status, expected } of cases) {
      connections(ONE_CONNECTION, AFTER_SYNC, [{ ...AFTER_SYNC[0], status }]);
      api.requests.length = 0;

      const result = await runCli(['sync', 'run', '201', '--yes', '--json'], { home, api });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(expected);
      expect(result.stderr).not.toContain('Sync finished');
      expect(JSON.parse(result.stdout).connections[0].status).toBe(status);
      expect(mutations(api)).toHaveLength(1);
    }
  });

  test('times out with exit 1 when the connection stays UPDATING', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    const result = await runCli(['sync', 'run', '201', '--yes', '--json', '--timeout', '1'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Waiting up to 1s for connection 501 to finish the Sync...');
    expect(result.stderr).toContain('Connection 501 is still UPDATING after 1s; no final status. Run sync list again to see the result.');
    expect(result.stderr).not.toContain('Sync finished');
    const doc = JSON.parse(result.stdout) as { timedOut: boolean; connections: { status: string }[] };
    expect(doc.timedOut).toBe(true);
    expect(doc.connections[0]?.status).toBe('UPDATING');
    expect(api.requests.filter((r) => r.path === '/v1/integracao/connections').length).toBeGreaterThan(2);
    expect(mutations(api)).toHaveLength(1);
  });

  test('rejects an invalid --timeout before any request', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);

    for (const timeout of ['-1', 'abc', '1.5']) {
      const result = await runCli(['sync', 'run', '201', '--yes', '--timeout', timeout], { home, api });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`Invalid timeout "${timeout}"`);
    }
    expect(api.requests).toHaveLength(0);
    expect(mutations(api)).toHaveLength(0);
  });

  test('a failed PUT reports the API message and does not read status again', async () => {
    connections(ONE_CONNECTION, AFTER_SYNC);
    api.fail('PUT /v1/integracao/connection/update/501', 500, { message: 'limit' });

    const result = await runCli(['sync', 'run', '201', '--yes', '--json'], { home, api });

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

    // One run past the bank's limit of 3 per day: the API decides, not a local counter.
    const exitCodes: number[] = [];
    for (let run = 0; run < 4; run += 1) {
      exitCodes.push((await runCli(['sync', 'run', '201', '--yes'], { home, api })).exitCode);
    }

    expect(exitCodes).toEqual([0, 0, 0, 0]);
    expect(mutations(api).map((r) => r.body)).toEqual([{ force: true }, { force: true }, { force: true }, { force: true }]);
  });
});
