import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, localDay, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement } from './import-harness.js';

// The `since` a --plan carries: the value `entries import list --json` writes.
// Fictional ids. 1001 is Nubank (connection account 9001); its last statement date is 2026-01-10.
const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const STATEMENT_PATH = '/v1/integracao/account/9001/transactions';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  entries([]);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function bank(integrationId: string) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1 };
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

/** Writes the plan file and returns its path. */
function planFile(content: unknown): string {
  const path = join(home.dir, 'plan.json');
  writeFileSync(path, JSON.stringify(content));
  return path;
}

/** `entries import run` without a --since: each test passes only what it needs. */
function run(args: string[]) {
  return runCli(['entries', 'import', 'run', '-a', '1001', ...args], { home, api });
}

/** The `start` of the last statement request the CLI sent, or null when it sent none. */
function statementStart(): string | null {
  const request = api.requests.filter((item) => item.path === STATEMENT_PATH).at(-1);
  return request?.query.get('start') ?? null;
}

describe('entries import run --plan since', () => {
  test('the run loads the statement since the plan carries', async () => {
    mockStatement(api, [bank(TX1)]);
    const since = localDay(-40);

    const result = await run([
      '--plan',
      planFile({ since, transactions: [{ id: 'aaaa1111', action: 'import', category: 10 }] }),
      '--dry-run',
      '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).imported).toMatchObject([{ integrationId: TX1 }]);
    expect(statementStart()).toBe(since);
  });

  test('an explicit --since overrides the plan', async () => {
    mockStatement(api, [bank(TX1)]);
    const planSince = localDay(-40);
    const flagSince = localDay(-20);

    const result = await run([
      '--plan',
      planFile({ since: planSince, transactions: [{ id: 'aaaa1111', action: 'import', category: 10 }] }),
      '--since',
      flagSince,
      '--dry-run',
      '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(statementStart()).toBe(flagSince);
  });

  test('a plan without since keeps the default: the last statement date, at most 90 days back', async () => {
    mockStatement(api, [bank(TX1)]);

    const result = await run([
      '--plan',
      planFile({ transactions: [{ id: 'aaaa1111', action: 'import', category: 10 }] }),
      '--dry-run',
      '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(statementStart()).toBe(localDay(-90));
  });

  test('a plan with a since that is not a calendar date fails before any request', async () => {
    const result = await run([
      '--plan',
      planFile({ since: '2026-02-31', transactions: [{ id: 'aaaa1111', action: 'skip' }] }),
      '--yes',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('"since" must be a calendar date');
    expect(api.requests).toHaveLength(0);
  });
});
