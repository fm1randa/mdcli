import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Fictional ids. 1001 is Nubank (connection account 9001). Category 10 is Alimentação (d).
const CONNECTIONS = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }] },
];
const FONTE = 'Importado via Integração bancária automática';

const TX1 = 'aaaa1111-1111-4000-8000-000000000001';
const TX2 = 'bbbb2222-2222-4000-8000-000000000002';
const TX3 = 'cccc3333-3333-4000-8000-000000000003';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CONNECTIONS);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  entries([]);
  api.on('POST /v1/integracao/transactions/markImported', {});
  api.on('POST /v1/lancamentos/conciliacao', {});
  api.on('POST /v1/lancamentos/importar', {});
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
    saldo: 250.5,
    lancamentos: rows,
  });
}

function entries(list: unknown[]) {
  api.on('GET /v2/lancamentos', { list, meta: { total: list.length, page: 1, pageSize: 500 } });
}

function run(args: string[], stdin?: string) {
  return runCli(['entries', 'import', 'run', '-a', '1001', '--since', '2026-10-01', ...args], { home, api, stdin });
}

function routes(): string[] {
  return mutations(api).map((request) => `${request.method} ${request.path}`);
}

const COMMIT = [
  'POST /v1/integracao/transactions/markImported',
  'POST /v1/lancamentos/conciliacao',
  'POST /v1/lancamentos/importar',
];

describe('entries import run --yes', () => {
  test('writes markImported, then conciliacao, then importar, with the web bodies', async () => {
    statement([
      bank(TX1, { _ca: { c: { d: { descricao: { v: 'Padaria' }, tags: { v: [7] } } } } }),
      bank(TX2, { valor: -5, data: '2026-10-08' }),
    ]);

    const before = Date.now();
    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--reject', 'bbbb2222', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    const [mark, conciliation, importing] = mutations(api);
    expect(mark.body).toEqual({ account: 9001, ids: [TX1, TX2], date: '2026-10-08' });
    expect(conciliation.body).toEqual({
      sobrescrever: false,
      sobrescreverDescr: false,
      inicio: '2026-10-01',
      fim: '2026-10-10',
      saldo: 250.5,
      conta: 1001,
      lancamentos: [],
      considerarObservacoes: false,
      connectionAccount: 9001,
      maxDate: '2026-10-08',
      fonte: FONTE,
    });
    const body = importing.body as { importId: number };
    expect(body.importId).toBeGreaterThanOrEqual(before);
    expect(body.importId).toBeLessThanOrEqual(Date.now());
    expect(importing.body).toEqual({
      lancamentos: [
        {
          integrationId: TX1,
          moeda: 1,
          descricao: 'Padaria',
          conta: 1001,
          categoria: 10,
          tags: [7],
          confirmado: true,
          conciliado: true,
          dataPrevista: '2026-10-07',
          valorPrevisto: -12.34,
          dataEfetiva: '2026-10-07',
          valorEfetivo: -12.34,
        },
      ],
      connectionAccount: 9001,
      maxDate: '2026-10-08',
      fonte: FONTE,
      importId: body.importId,
    });
    const document = JSON.parse(result.stdout);
    expect(document.dryRun).toBe(false);
    expect(document.imported.map((row: { integrationId: string }) => row.integrationId)).toEqual([TX1]);
    expect(document.rejected).toEqual([{ integrationId: TX2, prefix: 'bbbb2222' }]);
    expect(document.markImportedError).toBeNull();
  });
});

describe('entries import run confirmation', () => {
  test('shows the summary, and any answer but y cancels without a commit POST', async () => {
    statement([bank(TX1)]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10'], 'n\n');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Import 1, conciliate 0, reject 0, skip 0.');
    expect(result.stdout).toContain('(y/N)');
    expect(result.stdout).toContain('Import cancelled. Nothing was written.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('y writes the import', async () => {
    statement([bank(TX1)]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10'], 'y\n');

    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    expect(result.stdout).toContain('Import written');
  });

  test('a batch that only skips writes nothing, asks nothing, and lists what it skipped', async () => {
    statement([bank(TX1)]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const result = await run(['--ids', 'aaaa1111', '-c', '10']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('(y/N)');
    expect(result.stdout).toContain('aaaa1111 (duplicate)');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('entries import run linking and status', () => {
  test('a linked Bank Transaction repeats the Entry fields, keeps out of markImported, and imports nothing', async () => {
    statement([bank(TX1)]);
    entries([
      {
        id: 4242,
        dataPrevista: '2026-10-08',
        valor: -12.34,
        descricao: 'Padaria do bairro',
        categoria: 11,
        tags: [3],
        contato: 5,
        centro: null,
        observacoes: 'not repeated',
      },
    ]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT.slice(1));
    const [conciliation, importing] = mutations(api);
    expect((conciliation.body as { lancamentos: unknown }).lancamentos).toEqual([
      { data: '2026-10-07', valor: -12.34, descricao: 'Padaria do bairro', categoria: 11, tags: [3], contato: 5, ids: [4242] },
    ]);
    expect((conciliation.body as { maxDate: string }).maxDate).toBe('2026-10-07');
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([]);
    expect(JSON.parse(result.stdout).conciliated[0].entryId).toBe(4242);
  });

  test('a future date is Scheduled: not confirmed, not reconciled, no effective date or value', async () => {
    statement([bank(TX1, { data: '2099-01-05' })]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.exitCode).toBe(0);
    const [, , importing] = mutations(api);
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([
      {
        integrationId: TX1,
        moeda: 1,
        descricao: 'Padaria Ficticia',
        conta: 1001,
        categoria: 10,
        tags: [],
        confirmado: false,
        conciliado: false,
        dataPrevista: '2099-01-05',
        valorPrevisto: -12.34,
      },
    ]);
  });

  test('a card Entry takes the bank date as dataCompetencia, without dataPrevista or dataEfetiva', async () => {
    api.on('GET /v1/integracao/connections', [
      { id: 502, status: 'UPDATED', accounts: [{ id: 9002, type: 'CARTAO DE CREDITO', conta: 1002 }] },
    ]);
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', { lancamentos: [] });
    api.on('GET /v1/integracao/account/9002/transactions', {
      inicio: '2026-10-01',
      fim: '2026-10-10',
      saldo: -40,
      lancamentos: [bank(TX1, { nomePlastico: 'FICTICIO' }), bank(TX3, { data: '2099-02-01', valor: -3 })],
    });

    const result = await runCli(
      ['entries', 'import', 'run', '-a', '1002', '--since', '2026-10-01', '--ids', 'aaaa,cccc', '-c', '10', '--yes', '--json'],
      { home, api },
    );

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    const [mark, , importing] = mutations(api);
    expect(mark.body).toEqual({ account: 9002, ids: [TX1, TX3], date: '2099-02-01' });
    const common = { moeda: 1, descricao: 'Padaria Ficticia', conta: 1002, categoria: 10, tags: [] };
    expect((importing.body as { lancamentos: unknown }).lancamentos).toEqual([
      {
        ...common,
        integrationId: TX1,
        confirmado: true,
        conciliado: true,
        dataCompetencia: '2026-10-07',
        valorPrevisto: -12.34,
        valorEfetivo: -12.34,
      },
      { ...common, integrationId: TX3, confirmado: false, conciliado: false, dataCompetencia: '2099-02-01', valorPrevisto: -3 },
    ]);
  });

  test('a reject without a bank date is refused before any write', async () => {
    statement([bank(TX1), bank(TX2, { data: undefined })]);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--reject', 'bbbb2222', '--yes']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('bbbb2222: the bank did not send a date.');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('entries import run pages and failures', () => {
  test('pages of 200 in date order, each with its own markImported, conciliacao, importar and maxDate', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => {
      const day = index === 0 ? '2026-10-09' : '2026-10-02';
      const id = `dddd${String(index).padStart(4, '0')}-0000-4000-8000-000000000000`;
      return bank(id, { data: day, valor: -(index + 1) });
    });
    statement(rows);
    const ids = rows.map((row) => row.integrationId.slice(0, 8)).join(',');

    const result = await run(['--ids', ids, '-c', '10', '--yes', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual([...COMMIT, ...COMMIT]);
    const bodies = mutations(api).map((request) => request.body as Record<string, unknown[] | string>);
    expect(bodies[0].ids).toHaveLength(200);
    expect(bodies[0].date).toBe('2026-10-02');
    expect(bodies[2].lancamentos).toHaveLength(200);
    expect(bodies[2].maxDate).toBe('2026-10-02');
    expect(bodies[3].ids).toEqual([rows[0].integrationId]);
    expect(bodies[3].date).toBe('2026-10-09');
    expect(bodies[5].maxDate).toBe('2026-10-09');
    for (const body of [bodies[2], bodies[5]]) {
      for (const entry of body.lancamentos as { categoria?: unknown }[]) expect(entry.categoria).toBe(10);
    }
  });

  test('a failed markImported is reported and the commit goes on', async () => {
    statement([bank(TX1)]);
    api.on('POST /v1/integracao/transactions/markImported', { message: 'busy' }, 500);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.exitCode).toBe(0);
    expect(routes()).toEqual(COMMIT);
    expect(result.stderr).toContain('markImported failed');
    const document = JSON.parse(result.stdout);
    expect(document.markImportedError).toContain('markImported failed');
    expect(document.dryRun).toBe(false);
  });

  test('a failed conciliacao stops before importar and says how many pages were written', async () => {
    statement([bank(TX1)]);
    api.on('POST /v1/lancamentos/conciliacao', { message: 'no' }, 500);

    const result = await run(['--ids', 'aaaa1111', '-c', '10', '--yes', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(routes()).toEqual(COMMIT.slice(0, 2));
    expect(JSON.parse(result.stderr).error).toContain('Pages written before the failure: 0 of 1.');
  });

  test('a failed importar on the second page says one page was written', async () => {
    const rows = Array.from({ length: 201 }, (_, index) =>
      bank(`eeee${String(index).padStart(4, '0')}-0000-4000-8000-000000000000`, { valor: -(index + 1) }));
    statement(rows);
    let calls = 0;
    api.on('POST /v1/lancamentos/importar', () => {
      calls += 1;
      return calls === 1 ? {} : Response.json({ message: 'down' }, { status: 503 });
    });

    const result = await run(['--ids', rows.map((row) => row.integrationId.slice(0, 8)).join(','), '-c', '10', '--yes']);

    expect(result.exitCode).toBe(1);
    expect(routes()).toEqual([...COMMIT, ...COMMIT]);
    expect(result.stderr).toContain('Pages written before the failure: 1 of 2.');
  });
});
