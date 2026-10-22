import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// The --plan file itself: its keys and types, the flags it combines with, and its prefixes.
// Fictional ids. 1001 is Nubank (connection account 9001).
// Categories: 10 Alimentação (d), 20 Salário (r), 30 Transferência (t), 60 Antiga (d, inactive).
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];
const INACTIVE = { ...CATEGORIES_RESPONSE.items[4], id: 60, nome: 'Antiga', nomeRel: 'Antiga', status: false };

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', { ...CATEGORIES_RESPONSE, items: [...CATEGORIES_RESPONSE.items, INACTIVE] });
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

function bank(integrationId: string, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: 'Padaria Ficticia', valor: -12.34, data: '2026-10-07', moeda: 1, ...extra };
}

function statement(rows: unknown[]) {
  api.on('GET /v1/integracao/account/9001/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 0,
    lancamentos: rows,
  });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

/** Writes the plan file and returns its path. A string is written as is. */
function planFile(content: unknown): string {
  const path = join(home.dir, 'plan.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

function run(args: string[], stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', '2026-10-01', ...args], { home, api, stdin });
}

async function refused(plan: unknown) {
  const result = await run(['--plan', planFile(plan), '--yes']);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(mutations(api)).toHaveLength(0);
  return result.stderr;
}

describe('entries import run --plan file checks', () => {
  test('an unknown key fails the whole command before any request, even with --yes', async () => {
    statement([bank(TX1)]);
    const path = planFile({ transactions: [{ id: 'aaaa1111', action: 'import', category: 10, memo: 'x' }] });

    const result = await run(['--plan', path, '--yes', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error).toContain('transactions[0]: unknown key "memo".');
    expect(api.requests).toHaveLength(0);
  });

  test('an unknown action, a wrong type, and a missing category are all listed at once', async () => {
    const result = await run([
      '--plan',
      planFile({
        transactions: [
          { id: 'aaaa1111', action: 'ignore' },
          { id: 'bbbb2222', action: 'import', category: 10, value: '-12.34' },
          { id: 'cccc3333', action: 'conciliate', entry: '9001' },
          { id: 'dddd4444', action: 'import' },
          { id: 42, action: 'skip' },
        ],
      }),
      '--yes',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('transactions[0]: "action" must be one of import, skip, reject, conciliate.');
    expect(result.stderr).toContain('transactions[1]: "value" must be a number.');
    expect(result.stderr).toContain('transactions[2]: "entry" must be a numeric Entry id.');
    expect(result.stderr).toContain('transactions[3]: "category" is required for import.');
    expect(result.stderr).toContain('transactions[4]: "id" must be a prefix or UUID string.');
    expect(api.requests).toHaveLength(0);
  });

  test('a key that does not apply to the action, an unknown top-level key, or bad JSON fails', async () => {
    const wrongKey = await run(['--plan', planFile({ transactions: [{ id: 'aaaa1111', action: 'skip', entry: 4242 }] }), '--yes']);
    expect(wrongKey.stderr).toContain('transactions[0]: "entry" does not apply to skip.');

    const linked = await run([
      '--plan',
      planFile({ transactions: [{ id: 'aaaa1111', action: 'conciliate', description: 'Nova' }] }),
      '--yes',
    ]);
    expect(linked.stderr).toContain('transactions[0]: "description" does not apply to conciliate.');

    const topLevel = await run(['--plan', planFile({ account: 1001, transactions: [] }), '--yes']);
    expect(topLevel.stderr).toContain('unknown key "account"');

    const broken = await run(['--plan', planFile('{"transactions": ['), '--yes']);
    expect(broken.stderr).toContain('The --plan file is not valid JSON');

    for (const result of [wrongKey, linked, topLevel, broken]) expect(result.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });

  test('--include-duplicates is accepted with --plan, where each explicit action still rules', async () => {
    statement([bank(TX1), bank(TX2, { valor: -7 })]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }, { id: 78, valor: -7 }] });

    const result = await run([
      '--plan',
      planFile({
        transactions: [
          { id: 'aaaa1111', action: 'import', category: 10 },
          { id: 'bbbb2222', action: 'skip' },
        ],
      }),
      '--include-duplicates',
      '--dry-run',
      '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.imported.map((item: { integrationId: string }) => item.integrationId)).toEqual([TX1]);
    expect(body.skipped).toEqual([{ integrationId: TX2, prefix: 'bbbb2222', reason: 'plan' }]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('--reject, --category, and --ids do not combine with --plan', async () => {
    const path = planFile({ transactions: [{ id: 'aaaa1111', action: 'skip' }] });

    const reject = await run(['--plan', path, '--reject', 'aaaa1111', '--dry-run']);
    const category = await run(['--plan', path, '-c', '10', '--dry-run']);
    const ids = await run(['--plan', path, '--ids', 'aaaa1111', '--dry-run']);

    expect(reject.stderr).toContain('--reject does not combine with --plan.');
    expect(category.stderr).toContain('--category does not combine with --plan.');
    expect(ids.stderr).toContain('--ids does not combine with --plan.');
    for (const result of [reject, category, ids]) expect(result.exitCode).toBe(1);
    expect(api.requests).toHaveLength(0);
  });

  test('a prefix that matches nothing, or the same transaction twice, fails without a commit', async () => {
    statement([bank(TX1)]);

    expect(await refused({ transactions: [{ id: 'ffff', action: 'skip' }] })).toContain(
      '--plan ffff does not match any bank transaction.',
    );
    expect(
      await refused({ transactions: [{ id: 'aaaa', action: 'skip' }, { id: TX1, action: 'reject' }] }),
    ).toContain(`aaaa1111: selected twice (aaaa and ${TX1}).`);
  });

  test('unknown and ambiguous prefixes are listed together with every other problem', async () => {
    statement([bank(TX1), bank('aaaa9999-1111-4000-8000-000000000009', { valor: -5 }), bank(TX2, { valor: 30 })]);

    const stderr = await refused({
      transactions: [
        { id: 'ffff', action: 'skip' },
        { id: 'aaaa', action: 'reject' },
        { id: 'bbbb2222', action: 'import', category: 10 },
        { id: 'eeee', action: 'skip' },
      ],
    });

    expect(stderr).toContain('--plan ffff does not match any bank transaction.');
    expect(stderr).toContain('--plan aaaa matches 2 bank transactions. Use a longer prefix.');
    expect(stderr).toContain('bbbb2222: category "Alimentação" is an expense, so the value must be negative.');
    expect(stderr).toContain('--plan eeee does not match any bank transaction.');
  });
});
