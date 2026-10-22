import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank (connection account 9001).
// Categories: 10 Alimentação (d), 20 Salário (r), 30 Transferência (t), 60 Antiga (d, inactive).
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];
const INACTIVE = { ...CATEGORIES_RESPONSE.items[4], id: 60, nome: 'Antiga', nomeRel: 'Antiga', status: false };

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';
const TX3 = 'cccc3333-3333-4000-8000-000000000003';
const TX4 = 'dddd4444-4444-4000-8000-000000000004';

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

async function dryRun(transactions: unknown[]) {
  const result = await run(['--plan', planFile({ transactions }), '--dry-run', '--json']);
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  expect(mutations(api)).toHaveLength(0);
  return JSON.parse(result.stdout);
}

describe('entries import run --plan --dry-run', () => {
  test('an import item may flip the sign and replace the description', async () => {
    statement([bank(TX1, { valor: 50, _ca: { c: { d: { descricao: { v: 'Sugerida' } } } } })]);

    const body = await dryRun([
      { id: 'aaaa1111', action: 'import', category: 10, value: -50, description: 'Estorno do mercado' },
    ]);

    expect(body.imported).toEqual([
      {
        integrationId: TX1,
        prefix: 'aaaa1111',
        date: '2026-10-07',
        value: -50,
        description: 'Estorno do mercado',
        categoryId: 10,
        tagIds: [],
        status: 'reconciled',
      },
    ]);
  });

  test('without description the suggestion is used, and the new sign must match the category type', async () => {
    statement([bank(TX1, { _ca: { c: { d: { descricao: { v: 'Sugerida' } } } } }), bank(TX2, { descricao: 'Pix recebido' })]);

    const body = await dryRun([
      { id: 'aaaa1111', action: 'import', category: 'Alimentação' },
      { id: TX2, action: 'import', category: 20, value: 12.34 },
    ]);

    expect(body.imported.map((item: { description: string }) => item.description)).toEqual(['Sugerida', 'Pix recebido']);
    expect(body.imported.map((item: { value: number }) => item.value)).toEqual([-12.34, 12.34]);
    expect(body.imported.map((item: { categoryId: number }) => item.categoryId)).toEqual([10, 20]);
  });

  test('a value whose absolute differs from the bank, or whose new sign fights the category, fails the batch', async () => {
    statement([bank(TX1), bank(TX2)]);

    const stderr = await refused({
      transactions: [
        { id: 'aaaa1111', action: 'import', category: 10, value: -12.35 },
        { id: 'bbbb2222', action: 'import', category: 10, value: 12.34 },
      ],
    });

    expect(stderr).toContain('aaaa1111: value -12.35 is not the bank value -12.34. Only the sign can change.');
    expect(stderr).toContain('bbbb2222: category "Alimentação" is an expense, so the value must be negative.');
  });

  test('skip and reject need no category; skip is reported with reason plan', async () => {
    statement([bank(TX1), bank(TX2), bank(TX3)]);

    const body = await dryRun([
      { id: 'aaaa1111', action: 'skip' },
      { id: 'bbbb2222', action: 'reject' },
      { id: 'cccc3333', action: 'import', category: 10 },
    ]);

    expect(body.skipped).toEqual([{ integrationId: TX1, prefix: 'aaaa1111', reason: 'plan' }]);
    expect(body.rejected).toEqual([{ integrationId: TX2, prefix: 'bbbb2222' }]);
    expect(body.imported).toHaveLength(1);
  });

  test('an explicit import of a duplicate is imported instead of skipped', async () => {
    statement([bank(TX1)]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const body = await dryRun([{ id: 'aaaa1111', action: 'import', category: 10 }]);

    expect(body.skipped).toEqual([]);
    expect(body.imported.map((item: { integrationId: string }) => item.integrationId)).toEqual([TX1]);
  });

  test('conciliate links the chosen entry among several candidates', async () => {
    statement([bank(TX1)]);
    entries([
      { id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria A' },
      { id: 4343, dataPrevista: '2026-10-09', valor: -12.34, descricao: 'Padaria B' },
    ]);

    const body = await dryRun([{ id: 'aaaa1111', action: 'conciliate', entry: 4343 }]);

    expect(body.conciliated).toEqual([
      {
        integrationId: TX1,
        prefix: 'aaaa1111',
        entryId: 4343,
        before: { value: -12.34, description: 'Padaria B' },
        after: { value: -12.34, description: 'Padaria B' },
      },
    ]);
  });

  test('conciliate without entry uses the one automatic candidate', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria A' }]);

    const body = await dryRun([{ id: 'aaaa1111', action: 'conciliate' }]);

    expect(body.conciliated.map((item: { entryId: number }) => item.entryId)).toEqual([4242]);
  });

  test('candidate rules: import with a candidate, conciliate ambiguous, unknown entry, or no candidate', async () => {
    statement([bank(TX1), bank(TX2, { valor: -7 }), bank(TX3, { valor: -8 }), bank(TX4, { valor: -9 })]);
    entries([
      { id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria A' },
      { id: 5151, dataPrevista: '2026-10-07', valor: -7, descricao: 'Feira A' },
      { id: 5252, dataPrevista: '2026-10-08', valor: -7, descricao: 'Feira B' },
      { id: 6161, dataPrevista: '2026-10-07', valor: -8, descricao: 'Banca' },
    ]);

    const stderr = await refused({
      transactions: [
        { id: 'aaaa1111', action: 'import', category: 10 },
        { id: 'bbbb2222', action: 'conciliate' },
        { id: 'cccc3333', action: 'conciliate', entry: 4242 },
        { id: 'dddd4444', action: 'conciliate' },
      ],
    });

    expect(stderr).toContain('aaaa1111: entries 4242 may already record it.');
    expect(stderr).toContain('bbbb2222: 2 entries may match it (5151, 5252). Say which one with "entry".');
    expect(stderr).toContain('cccc3333: entry 4242 is not a candidate (candidates: 6161).');
    expect(stderr).toContain('dddd4444: no entry matches it, so there is nothing to link.');
  });

  test('an inactive category is refused like entries create', async () => {
    statement([bank(TX1)]);

    const stderr = await refused({ transactions: [{ id: 'aaaa1111', action: 'import', category: 60 }] });

    expect(stderr).toContain('Category "Antiga" (60) is inactive');
  });

  test('the table names each category and the skipped reason', async () => {
    statement([bank(TX1), bank(TX2, { valor: 30 }), bank(TX3)]);

    const result = await run([
      '--plan',
      planFile({
        transactions: [
          { id: 'aaaa1111', action: 'import', category: 10 },
          { id: 'bbbb2222', action: 'import', category: 20 },
          { id: 'cccc3333', action: 'skip' },
        ],
      }),
      '--dry-run',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Import 2, conciliate 0, reject 0, skip 1.');
    expect(result.stdout).toContain('Alimentação');
    expect(result.stdout).toContain('Salário');
    expect(result.stdout).toContain('cccc3333 (plan)');
    expect(mutations(api)).toHaveLength(0);
  });
});

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
});
