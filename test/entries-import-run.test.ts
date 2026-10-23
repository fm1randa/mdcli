import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement } from './import-harness.js';

// Fictional ids. 1001 is Nubank, 9001 its connection account. Category 10 is Alimentação (d), 20 Salário (r).

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v2/lancamentos', { list: [], meta: { total: 0, page: 1, pageSize: 500 } });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[]) {
  mockStatement(api, rows, { saldo: 250.5 });
}

function run(args: string[], stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', '2026-10-01', ...args], { home, api, stdin });
}

describe('entries import run --dry-run', () => {
  test('--ids with --category describes the Entry it would create and sends no write', async () => {
    statement([
      bank(TX1, { _ca: { c: { d: { descricao: { v: 'Padaria' }, tags: { v: [7] } } } } }),
      bank(TX2, { valor: -5 }),
    ]);

    const result = await run(['--ids', 'AAAA1111', '-c', '10', '--dry-run', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      dryRun: true,
      accountId: 1001,
      connectionAccount: 9001,
      statement: { start: '2026-10-01', end: '2026-10-10', balance: 250.5 },
      overwrite: { value: false, description: false, source: 'default' },
      imported: [
        {
          integrationId: TX1,
          prefix: 'aaaa1111',
          date: '2026-10-07',
          value: -12.34,
          description: 'Padaria',
          categoryId: 10,
          tagIds: [7],
          status: 'reconciled',
        },
      ],
      conciliated: [],
      rejected: [],
      skipped: [],
      markImportedError: null,
    });
    expect(mutations(api)).toHaveLength(0);
  });

  test('does not ask the AI for a category: --category already gives it', async () => {
    statement([
      bank(TX1, { _ca: { ait: { d: ['d', 'padaria ficticia'] } } }),
      bank(TX2, { valor: -5, _ca: { ait: { d: ['d', 'mercado'] } } }),
    ]);
    api.on('POST /v1/smartmatch/ai', [10, 10]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--reject', 'bbbb2222', '--dry-run', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { imported: { categoryId: number }[] };
    expect(body.imported.map((row) => row.categoryId)).toEqual([10]);
    expect(api.requests.some((r) => r.path === '/v1/smartmatch/ai')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('entries import run selection', () => {
  test('fails without --ids or --reject and reads nothing', async () => {
    statement([bank(TX1)]);

    const result = await run(['--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Nothing selected');
    expect(api.requests.some((r) => r.path.includes('/transactions'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('--ids without --category fails, and --category without --ids fails', async () => {
    statement([bank(TX1)]);

    const noCategory = await run(['--ids', 'aaaa1111', '--dry-run']);
    expect(noCategory.exitCode).toBe(1);
    expect(noCategory.stderr).toContain('--ids needs -c, --category');

    const onlyCategory = await run(['--reject', 'aaaa1111', '-c', '10', '--dry-run']);
    expect(onlyCategory.exitCode).toBe(1);
    expect(onlyCategory.stderr).toContain('--category only applies to --ids');
    expect(mutations(api)).toHaveLength(0);
  });

  test('the same prefix in --ids and --reject fails, also when the case or the length differs', async () => {
    statement([bank(TX1), bank(TX2, { valor: -5 })]);

    const same = await run(['--ids', 'aaaa1111', '--reject', 'AAAA1111', '-c', '10', '--dry-run']);
    expect(same.exitCode).toBe(1);
    expect(same.stderr).toContain('aaaa1111 is in both --ids and --reject');

    const longer = await run(['--ids', 'aaaa', '--reject', 'aaaa1111-1111', '-c', '10', '--dry-run']);
    expect(longer.exitCode).toBe(1);
    expect(longer.stdout).toBe('');
    expect(longer.stderr).toContain('aaaa1111 is selected by both --ids and --reject');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a prefix that matches nothing, or two bank transactions, fails', async () => {
    statement([bank(TX1), bank('aaaa2222-2222-4000-8000-000000000003', { valor: -5 })]);

    const unknown = await run(['--ids', 'cccc', '-c', '10', '--dry-run']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toContain('--ids cccc does not match any bank transaction');

    const ambiguous = await run(['--reject', 'AAAA', '--dry-run']);
    expect(ambiguous.exitCode).toBe(1);
    expect(ambiguous.stdout).toBe('');
    expect(ambiguous.stderr).toContain('--reject AAAA matches 2 bank transactions');
    expect(mutations(api)).toHaveLength(0);
  });

  test('--reject alone needs no category and lists the full UUID', async () => {
    statement([bank(TX1), bank(TX2, { valor: 40 })]);

    const result = await run(['--reject', 'bbbb', '--dry-run', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.rejected).toEqual([{ integrationId: TX2, prefix: 'bbbb2222' }]);
    expect(body.imported).toEqual([]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('--json without --yes and without --dry-run fails before any request', async () => {
    statement([bank(TX1)]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ error: 'entries import run --json requires --yes or --dry-run' });
    expect(api.requests).toHaveLength(0);
  });

  test('--dry-run with --yes prints the summary and writes nothing', async () => {
    statement([bank(TX1), bank(TX2, { valor: -5 })]);

    const result = await run(['--ids', 'aaaa1111', '-c', 'Alimentação', '--reject', 'bbbb', '--dry-run', '--yes']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Statement 2026-10-01 to 2026-10-10, balance R\$\s250,50/);
    expect(result.stdout).toContain('Import 1, conciliate 0, reject 1, skip 0.');
    expect(result.stdout).toContain('Alimentação');
    expect(result.stdout).toContain('Reconciled');
    expect(result.output).toContain('nothing was written');
    expect(mutations(api)).toHaveLength(0);
  });
});
