import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CREDIT_CARD_ACCOUNT, cardInvoice } from './fixtures.js';

// Dogfood 2026-10-19 (cards and invoices): --month due day and validation,
// the item dates of cards invoice --json and the card fields of cards list --json.
let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('cards list --json', () => {
  // Dogfood 2026-10-19: the JSON lacked what the table and the web show.
  test('--json adds limit, due and closing dates and the payment account', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [
        {
          ...CREDIT_CARD_ACCOUNT,
          limite: 21804,
          fechamento: 11,
          contada: 1001,
          proximoVencimento: '2026-11-16',
          proximoFechamento: '2026-11-05',
          saldoUltimoExtrato: 16207,
        },
        { ...CREDIT_CARD_ACCOUNT, id: 1003, nome: 'Cartão Novo', proximoVencimento: undefined, proximoFechamento: undefined },
      ],
    });

    const result = await runCli(['cards', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 1002,
        name: 'Cartão Azul',
        type: 'CARTAOCREDITO',
        bank: null,
        balance: 16207,
        active: true,
        closed: false,
        limit: 21804,
        dueDay: 16,
        nextDueDate: '2026-11-16',
        nextClosingDate: '2026-11-05',
        closingDaysBeforeDue: 11,
        paymentAccountId: 1001,
      },
      {
        id: 1003,
        name: 'Cartão Novo',
        type: 'CARTAOCREDITO',
        bank: null,
        balance: 250.5,
        active: true,
        closed: false,
        limit: null,
        dueDay: null,
        nextDueDate: null,
        nextClosingDate: null,
        closingDaysBeforeDue: null,
        paymentAccountId: null,
      },
    ]);
  });
});

describe('cards invoice --month', () => {
  // Dogfood 2026-10-19: the real API sends proximoVencimento as a bare date;
  // new Date('2026-11-16').getDate() is 15 in UTC-3, so --month asked for the
  // invoice due on the 15th. CI runs in UTC, so force Brazil's time zone.
  test('--month keeps the due day of a date-only proximoVencimento in UTC-3', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [{ ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-11-16', proximoFechamento: '2026-11-05' }],
    });
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', cardInvoice('2026-11-16', '2026-11-05', -10));

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11'], {
      home,
      api,
      extraEnv: { TZ: 'America/Sao_Paulo' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Invoice for Cartão Azul - 2026-11-16');
    expect(api.requests.filter((r) => r.path.startsWith('/v1/cartoes/')).map((r) => r.path)).toEqual([
      '/v1/cartoes/1002/fatura/2026-11-16',
    ]);
  });

  test('--month clamps a due day past the end of the month', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [{ ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-01-31' }],
    });
    api.on('GET /v1/cartoes/1002/fatura/2026-02-28', cardInvoice('2026-02-28', '2026-02-20'));

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-02', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(api.requests.at(-1)?.path).toBe('/v1/cartoes/1002/fatura/2026-02-28');
  });

  for (const month of ['2026-00', '2026-13', '2026-1', '11/2026']) {
    test(`--month ${month} is refused before any API call`, async () => {
      const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', month], { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        `Invalid invoice month "${month}". Use YYYY-MM with a month from 01 to 12 (e.g., 2026-10)`
      );
      expect(api.requests).toHaveLength(0);
    });
  }

  // Dogfood 2026-10-19: item 315471241 showed date 2025-11-19 here and
  // 2026-11-16 in entries list. date stays the purchase date; dueDate is
  // what entries list calls date.
  test('--json adds the due date and competence date of each item', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      ...cardInvoice('2026-11-16T00:00:00', '2026-11-05T00:00:00', -401.29),
      lancamentos: [
        { id: 315471241, descricao: 'Mac mini M4', valor: -301.29, data: '2025-11-19', parcela: '12/18', categoria: 11 },
        {
          id: 7,
          descricao: 'Livro',
          valor: -100,
          data: '2026-10-30',
          dataPrevista: '2026-11-16T00:00:00',
          dataCompetencia: '2026-10-29T00:00:00',
        },
      ],
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 315471241,
        description: 'Mac mini M4',
        date: '2025-11-19',
        dueDate: '2026-11-16',
        competenceDate: '2025-11-19',
        value: -301.29,
        categoryId: 11,
        installment: '12/18',
      },
      {
        id: 7,
        description: 'Livro',
        date: '2026-10-30',
        dueDate: '2026-11-16',
        competenceDate: '2026-10-29',
        value: -100,
        categoryId: null,
        installment: null,
      },
    ]);
  });
});
