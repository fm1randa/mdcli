import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mutations, runCli, type MockApi, type TestHome } from './helpers.js';
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

describe('sync run waiting', () => {
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
