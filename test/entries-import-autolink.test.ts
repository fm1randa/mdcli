import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';
import { SINCE } from './import-harness.js';

// Fictional ids. 1001 is Nubank (connection account 9001); 1002 is Cartão Azul (connection
// account 9002, proximoVencimento 2026-01-16). Statement 2026-10-01 to 2026-10-28, so the
// search window is 2026-09-29 to 2026-10-30.
//
// The web links one existing Entry to one Bank Transaction on its own (mdb.js `rt`): Entries in
// date order, day shifts 0, +1, -1, +2, -2, first with the document number and then without, each
// Entry linked once and each Bank Transaction linked once. A Reconciled Entry links only on the
// same day; on another day it is used up without a link. Reconciled Entries are hidden from the
// candidates unless linked (mdb.js `H`).

const CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
    ],
  },
];

const B1 = '10000000-1111-4000-8000-000000000001';
const B2 = '20000000-1111-4000-8000-000000000002';
const B3 = '30000000-1111-4000-8000-000000000003';
const B4 = '40000000-1111-4000-8000-000000000004';
const B5 = '50000000-1111-4000-8000-000000000005';
const B6 = '60000000-1111-4000-8000-000000000006';
const B7 = '70000000-1111-4000-8000-000000000007';

function bank(integrationId: string, data: string, valor: number, extra: Record<string, unknown> = {}) {
  return { integrationId, descricao: `Banco ${integrationId.slice(0, 1)}`, valor, data, moeda: 1, ...extra };
}

function entry(id: number, date: string, valor: number, status: string, extra: Record<string, unknown> = {}) {
  return { id, dataPrevista: date, valor, descricao: `Entry ${id}`, categoria: 40, status, ...extra };
}

const STATEMENT = {
  inicio: '2026-10-01',
  fim: '2026-10-28',
  saldo: 0,
  lancamentos: [
    // Two Bank Transactions with one key: +1 day comes before -1 day.
    bank(B1, '2026-10-10', -50, { _ca: { ait: { d: 'tok-b1' } } }),
    bank(B2, '2026-10-10', -50),
    // A Reconciled Entry on the same day links.
    bank(B3, '2026-10-15', 0.31),
    // A Reconciled Entry one day off is used up; the confirmed one on the other side links.
    bank(B4, '2026-10-20', -7),
    // Only a Reconciled Entry one day off: nothing is linked.
    bank(B5, '2026-10-25', -9, { _ca: { ait: { d: 'tok-b5' } } }),
    // The document number pass goes first: B7 is listed before B6, yet 709 (same document) wins it.
    bank(B7, '2026-10-05', -20, { ndocumento: 'D2' }),
    bank(B6, '2026-10-05', -20),
  ],
};

const ENTRIES = [
  entry(701, '2026-10-11', -50, 'confirmado'),
  entry(702, '2026-10-09', -50, 'confirmado'),
  entry(703, '2026-10-12', -50, 'confirmado'),
  entry(705, '2026-10-15', 0.31, 'conciliado'),
  entry(706, '2026-10-19', -7, 'conciliado'),
  entry(707, '2026-10-21', -7, 'confirmado'),
  entry(708, '2026-10-26', -9, 'conciliado'),
  entry(711, '2026-10-05', -20, 'confirmado'),
  entry(709, '2026-10-05', -20, 'confirmado', { ndocumento: 'D2' }),
];

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v1/integracao/account/9001/transactions', STATEMENT);
  api.on('GET /v2/lancamentos', { list: ENTRIES, meta: { total: ENTRIES.length, page: 1, pageSize: 500 } });
  api.on('POST /v1/smartmatch/ai', [null]);
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[], extraEnv?: Record<string, string>) {
  return runCli(args, { home, api, extraEnv });
}

interface Row {
  integrationId: string;
  conciliateWith: number | null;
  defaultAction: string;
  candidates: { id: number }[];
}

async function listed(): Promise<Map<string, Row>> {
  const result = await cli(['entries', 'import', 'list', '-a', '1001', '--since', SINCE, '--json']);
  expect(result.exitCode).toBe(0);
  const rows = JSON.parse(result.stdout).transactions as Row[];
  return new Map(rows.map((row) => [row.integrationId, row]));
}

/** Every POST but the AI suggestion, which a listing may send. */
function writes() {
  return mutations(api).filter((r) => r.path !== '/v1/smartmatch/ai');
}

function view(row: Row | undefined) {
  return row && { with: row.conciliateWith, action: row.defaultAction, candidates: row.candidates.map((c) => c.id) };
}

describe('entries import: one Entry linked automatically, like the web', () => {
  test('each Bank Transaction gets at most one Entry, chosen by day shift, document number, and Reconciled status', async () => {
    const rows = await listed();

    expect(view(rows.get(B1))).toEqual({ with: 702, action: 'conciliate', candidates: [702, 701, 703] });
    expect(view(rows.get(B2))).toEqual({ with: 701, action: 'conciliate', candidates: [702, 701, 703] });
    expect(view(rows.get(B3))).toEqual({ with: 705, action: 'conciliate', candidates: [705] });
    expect(view(rows.get(B4))).toEqual({ with: 707, action: 'conciliate', candidates: [707] });
    expect(view(rows.get(B5))).toEqual({ with: null, action: 'needs-category', candidates: [] });
    expect(view(rows.get(B7))?.with).toBe(709);
    expect(view(rows.get(B6))?.with).toBe(711);
    expect(writes()).toHaveLength(0);
  });

  test('asks the AI only for rows that were not linked', async () => {
    await listed();

    const ai = api.requests.filter((r) => r.path === '/v1/smartmatch/ai');
    expect(ai).toHaveLength(1);
    expect(ai[0].body).toEqual({ t: ['tok-b5'] });
  });

  test('a linked duplicate conciliates; an unlinked duplicate is skipped', async () => {
    api.on('GET /v1/lancamentos/duplicidade', {
      '2026-10-10': [{ id: 701, valor: -50 }],
      '2026-10-25': [{ id: 708, valor: -9 }],
    });

    const rows = await listed();

    expect(rows.get(B1)).toMatchObject({ duplicateOf: 701, conciliateWith: 702, defaultAction: 'conciliate' });
    expect(rows.get(B5)).toMatchObject({ duplicateOf: 708, conciliateWith: null, defaultAction: 'skip' });
  });

  test('run --ids conciliates each row with its linked Entry', async () => {
    const result = await cli([
      'entries', 'import', 'run', '-a', '1001', '--since', SINCE,
      '--ids', '10000000,20000000,30000000', '-c', '40', '--yes', '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const run = JSON.parse(result.stdout);
    expect(run.conciliated.map((item: { prefix: string; entryId: number }) => [item.prefix, item.entryId])).toEqual([
      ['10000000', 702],
      ['20000000', 701],
      ['30000000', 705],
    ]);
    const conciliacao = api.requests.find((r) => r.path === '/v1/lancamentos/conciliacao');
    const linked = (conciliacao?.body as { lancamentos: { ids: number[] }[] }).lancamentos.map((item) => item.ids);
    expect(linked.sort()).toEqual([[701], [702], [705]]);
  });

  test('the --edit file opens valid, with the linked Entry on each conciliate line', async () => {
    const seen = join(home.dir, 'seen.txt');
    const editor = join(home.dir, 'editor.sh');
    writeFileSync(editor, `cp "$1" "${seen}"\n`);

    const result = await cli(
      ['entries', 'import', 'run', '-a', '1001', '--since', SINCE, '--edit', '--dry-run', '--json'],
      { EDITOR: `sh ${editor}` },
    );
    const file = await Bun.file(seen).text();

    expect(file).toContain('conciliate 10000000 702 2026-10-10 -50.00');
    expect(file).toContain('conciliate 20000000 701 2026-10-10 -50.00');
    expect(file).toContain('conciliate 30000000 705 2026-10-15 0.31');
    // Reconciled 706 and 708 stay out of the candidate comments; 705 is linked, so it shows.
    expect(file).not.toMatch(/^# 706 /m);
    expect(file).not.toMatch(/^# 708 /m);
    expect(file).toMatch(/^# 705 /m);
    // The untouched file is the default plan; only B5 (no category) keeps it from passing.
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error).toContain('50000000');
    expect(JSON.parse(result.stderr).error).not.toContain('10000000');
    expect(writes()).toHaveLength(0);
  });

  test('a plan may link a Reconciled Entry hidden from the candidates', async () => {
    const plan = join(home.dir, 'plan.json');
    writeFileSync(plan, JSON.stringify({ transactions: [{ id: '50000000', action: 'conciliate', entry: 708 }] }));

    const result = await cli([
      'entries', 'import', 'run', '-a', '1001', '--since', SINCE, '--plan', plan, '--dry-run', '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).conciliated).toMatchObject([{ prefix: '50000000', entryId: 708 }]);
  });

  test('a card links by dataCompetencia, not the purchase date', async () => {
    api.on('GET /v1/integracao/account/9002/transactions', {
      inicio: '2026-10-01',
      fim: '2026-10-10',
      saldo: 0,
      lancamentos: [bank(B1, '2026-10-07', -30)],
    });
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
      vencimento: '2026-01-16',
      fechamento: '2026-01-08',
      valor: -30,
      lancamentos: [
        { id: 801, descricao: 'Compra', valor: -30, data: '2026-10-07', dataCompetencia: '2026-10-09', status: 'nconciliado' },
        { id: 802, descricao: 'Parcela', valor: -30, data: '2025-10-07', dataCompetencia: '2026-10-07', status: 'nconciliado' },
      ],
    });

    const result = await cli(['entries', 'import', 'list', '-a', '1002', '--since', SINCE, '--json']);

    expect(result.exitCode).toBe(0);
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.conciliateWith).toBe(802);
    expect(row.candidates.map((c: { id: number; date: string }) => [c.id, c.date])).toEqual([
      [802, '2026-10-07'],
      [801, '2026-10-09'],
    ]);
  });
});
