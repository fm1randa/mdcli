import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE, SAMPLE_ENTRIES, cardInvoice, entriesPage } from './fixtures.js';

let api: MockApi;
let home: TestHome;

// Finanças report (2026-10-16, card 987252): POST answered
// "46349170A2026-10-20" and the entry ID only showed up in the invoice.
const OCCURRENCE_ID = '46349170A2026-01-05';
const posted = { descricao: 'Voo', valor: -10, data: '2026-01-05', status: 'confirmado', conta: 1002 };

function invoice(due: string, lancamentos: unknown[]) {
  return { ...cardInvoice(due, `${due.slice(0, 8)}08`), lancamentos };
}

function invoicePaths(): string[] {
  return api.requests.filter((r) => r.path.startsWith('/v1/cartoes/1002/fatura/')).map((r) => r.path.split('/').at(-1) ?? '');
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  api.on('GET /v1/cartoes/1002/fatura/2025-12-16', invoice('2025-12-16', []));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const CREATE = ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05', '-p'];

describe('entries create on a card', () => {
  beforeEach(() => {
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', invoice('2026-01-16', [
      { id: 100, descricao: 'Voo', valor: -10, data: '2025-12-30' },
      { id: 363713401, descricao: 'Voo', valor: -10, data: '2026-01-05' },
      { id: 363713500, descricao: 'Voo', valor: -11, data: '2026-01-05' },
      { id: 363713600, descricao: 'Mercado', valor: -10, data: '2026-01-05' },
    ]));
  });

  test('answers with the entry ID from the invoice, not the occurrence ID', async () => {
    api.on('POST /v1/lancamentos', { ...posted, id: OCCURRENCE_ID });

    const result = await runCli([...CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 363713401, occurrenceId: OCCURRENCE_ID, descricao: 'Voo' });
  });

  test('the text output shows the entry ID too', async () => {
    api.on('POST /v1/lancamentos', { ...posted, id: OCCURRENCE_ID });

    const result = await runCli(CREATE, { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ID: 363713401');
    expect(result.stdout).not.toContain(OCCURRENCE_ID);
  });

  test('a numeric ID from the API is kept and the invoice is not read again', async () => {
    api.on('POST /v1/lancamentos', { ...posted, id: 555 });

    const result = await runCli([...CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe(555);
    const post = api.requests.findIndex((r) => r.method === 'POST');
    expect(api.requests.slice(post + 1).some((r) => r.path.startsWith('/v1/cartoes/'))).toBe(false);
  });

  test('warns on stderr and keeps stdout JSON when the purchase is not in the invoice', async () => {
    api.on('POST /v1/lancamentos', { ...posted, descricao: 'Hotel', id: OCCURRENCE_ID });

    const result = await runCli(['entries', 'create', '-a', '1002', '-d', 'Hotel', '-v', '10', '-c', '10', '-D', '2026-01-05', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe(OCCURRENCE_ID);
    expect(result.stderr).toContain('is not an entry ID');
    expect(result.stderr).toContain('mdcli cards invoice -a 1002 --month 2026-01');
  });
});

describe('entries list on a card', () => {
  test('lists the purchases of the invoices due in the range (Finanças, 2026-10-16)', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-10-16', invoice('2026-10-16', []));
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', invoice('2026-11-16', [
      { id: 363713401, descricao: 'Mercado', valor: -50, data: '2026-10-20', categoria: 11 },
    ]));
    api.on('GET /v1/cartoes/1002/fatura/2026-12-16', invoice('2026-12-16', []));

    const result = await runCli(['entries', 'list', '-a', '1002', '-f', '2026-10-01', '-t', '2026-12-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(invoicePaths()).toEqual(['2026-10-16', '2026-11-16', '2026-12-16']);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({
        id: 363713401,
        description: 'Mercado',
        date: '2026-11-16',
        competenceDate: '2026-10-20',
        value: -50,
        type: 'expense',
        status: 'confirmed',
        accountId: 1002,
        categoryId: 11,
      }),
    ]);
  });

  test('keeps the statement entries and skips invoice items it already returned', async () => {
    const onCard = { ...SAMPLE_ENTRIES[3], id: 77, dataPrevista: '2026-01-16' };
    api.on('GET /v2/lancamentos', entriesPage([SAMPLE_ENTRIES[0], onCard]));
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', invoice('2026-01-16', [
      { id: 77, descricao: 'Restaurante', valor: -200, data: '2026-01-10' },
      { id: 78, descricao: 'Livro', valor: -40, data: '2026-01-11' },
    ]));

    const result = await runCli(['entries', 'list', '-a', '1001,1002', '-f', '2026-01-01', '-t', '2026-01-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).map((e: { id: number }) => e.id)).toEqual([1, 77, 78]);
    const statement = api.requests.find((r) => r.path === '/v2/lancamentos');
    expect(JSON.parse(statement?.query.get('contas') ?? '').ids).toEqual([1001, 1002]);
  });

  describe('applies the filters the API would to invoice items', () => {
    beforeEach(() => {
      api.on('GET /v1/cartoes/1002/fatura/2026-01-16', invoice('2026-01-16', [
        { id: 81, descricao: 'Mercado', valor: -87.5, data: '2026-01-05', categoria: 11 },
        { id: 82, descricao: 'Geladeira', valor: -300, data: '2026-01-06', categoria: 10, parcela: '1/3', tags: [501] },
        { id: 83, descricao: 'Estorno', valor: 20, data: '2026-01-07', categoria: 10 },
      ]));
    });

    const cases: [string, string[], number[]][] = [
      ['keywords', ['-k', 'MERC'], [81]],
      ['category', ['-c', '10'], [82, 83]],
      ['tag', ['-g', '501'], [82]],
      ['value', ['-v', '300'], [82]],
      ['repetition', ['-R', 'installment'], [82]],
      ['type', ['-T', 'income'], [83]],
      ['status', ['-s', 'reconciled'], []],
    ];
    for (const [name, flags, ids] of cases) {
      test(name, async () => {
        const result = await runCli(['entries', 'list', '-a', '1002', '-f', '2026-01-01', '-t', '2026-01-31', ...flags, '--json'], { home, api });

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout).map((e: { id: number }) => e.id)).toEqual(ids);
      });
    }
  });

  test('summary counts card purchases too', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', invoice('2026-01-16', [
      { id: 81, descricao: 'Mercado', valor: -87.5, data: '2026-01-05', categoria: 11 },
    ]));

    const result = await runCli(['entries', 'summary', '-a', '1002', '-f', '2026-01-01', '-t', '2026-01-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).total).toMatchObject({ count: 1, expenses: -87.5 });
  });
});

describe('occurrence IDs on update, show and delete', () => {
  for (const command of [['update', '-d', 'X'], ['show'], ['delete', '--dangerously-skip-confirmation']]) {
    test(command[0], async () => {
      const result = await runCli(['entries', command[0], '46349170A2026-10-20', ...command.slice(1)], { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('is a series occurrence ID, not an entry ID');
      expect(api.requests.some((r) => r.path.startsWith('/v1/lancamentos'))).toBe(false);
    });
  }
});
