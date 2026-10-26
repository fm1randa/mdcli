import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { CONNECTIONS, mockStatement, SINCE } from './import-harness.js';

// Fictional ids. 1001 is Nubank (connection account 9001).
// Categories: 10 Alimentação (d), 20 Salário (r), 30 Transferência (t), 60 Antiga (d, inactive).
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
  mockStatement(api, rows);
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
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', SINCE, ...args], { home, api, stdin });
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

  test('conciliate without entry uses the automatically linked entry', async () => {
    statement([bank(TX1)]);
    entries([{ id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria A' }]);

    const body = await dryRun([{ id: 'aaaa1111', action: 'conciliate' }]);

    expect(body.conciliated.map((item: { entryId: number }) => item.entryId)).toEqual([4242]);
  });

  test('candidate rules: import of a linked row, conciliate with nothing linked, unknown entry, or no candidate', async () => {
    statement([bank(TX1), bank(TX2, { valor: -7 }), bank(TX3, { valor: -8 }), bank(TX4, { valor: -9 })]);
    entries([
      { id: 4242, dataPrevista: '2026-10-08', valor: -12.34, descricao: 'Padaria A' },
      // Four and five days before the bank date: candidates, neither linked automatically.
      { id: 5151, dataPrevista: '2026-10-03', valor: -7, descricao: 'Feira A' },
      { id: 5252, dataPrevista: '2026-10-02', valor: -7, descricao: 'Feira B' },
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

    expect(stderr).toContain('aaaa1111: entry 4242 already records it (linked automatically). Use conciliate, or skip it.');
    expect(stderr).toContain('bbbb2222: 2 entries may match it (5252, 5151), none linked automatically. Say which one with "entry".');
    expect(stderr).toContain('cccc3333: entry 4242 is not a candidate (candidates: 6161).');
    expect(stderr).toContain('dddd4444: no entry matches it, so there is nothing to link.');
  });

  test('a candidate beyond 2 days does not block import, and conciliate with entry still links it', async () => {
    statement([bank(TX1), bank(TX2, { valor: -7 })]);
    entries([
      { id: 4244, dataPrevista: '2026-10-20', valor: -12.34, descricao: 'Padaria prevista' },
      { id: 5353, dataPrevista: '2026-10-19', valor: -7, descricao: 'Feira prevista' },
    ]);

    const result = await run([
      '--plan',
      planFile({
        transactions: [
          { id: 'aaaa1111', action: 'import', category: 10 },
          { id: 'bbbb2222', action: 'conciliate', entry: 5353 },
        ],
      }),
      '--search-to',
      '2026-10-20',
      '--dry-run',
      '--json',
    ]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.imported).toEqual([expect.objectContaining({ integrationId: TX1, categoryId: 10 })]);
    expect(body.conciliated).toEqual([expect.objectContaining({ integrationId: TX2, entryId: 5353 })]);
    expect(mutations(api)).toHaveLength(0);
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
