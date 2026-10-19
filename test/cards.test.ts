import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CREDIT_CARD_ACCOUNT, cardInvoice } from './fixtures.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1002, name: 'azul' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('cards list', () => {
  test('--json returns only credit cards', async () => {
    const result = await runCli(['cards', 'list', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const cards = JSON.parse(result.stdout);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 1002,
      name: 'Cartão Azul',
      type: 'CARTAOCREDITO',
      active: true,
      closed: false,
    });
  });

  test('--active excludes inactive cards', async () => {
    api.on('GET /v1/cadastros/contas', {
      ...ACCOUNTS_RESPONSE,
      items: [
        ...ACCOUNTS_RESPONSE.items,
        { ...CREDIT_CARD_ACCOUNT, id: 1003, nome: 'Cartão Velho', status: false },
      ],
    });

    const result = await runCli(['cards', 'list', '--active', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const names = JSON.parse(result.stdout).map((c: { name: string }) => c.name);
    expect(names).toEqual(['Cartão Azul']);
  });
});

describe('cards invoice', () => {
  test('resolves the account alias and returns invoice entries as JSON', async () => {
    // --month builds YYYY-MM-DD from the card's day-of-month (16 from proximoVencimento)
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
      ...cardInvoice('2026-01-16', '2026-01-08'),
      lancamentos: [
        {
          id: 1,
          descricao: 'Mercado',
          valor: -87.5,
          data: '2026-01-05',
          categoria: 11,
        },
      ],
      valor: -87.5,
    });

    const result = await runCli(
      ['cards', 'invoice', '--account', 'azul', '--month', '2026-01', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 1,
        description: 'Mercado',
        date: '2026-01-05',
        dueDate: '2026-01-16',
        competenceDate: '2026-01-05',
        value: -87.5,
        categoryId: 11,
        installment: null,
      },
    ]);
  });

  test('rejects a non-credit-card account', async () => {
    const result = await runCli(['cards', 'invoice', '--account', '1001'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('not a credit card');
  });
});

describe('cards future', () => {
  // Dogfood 2026-10-19: GET /parcelasFuturas returns a bare array; the old
  // normalize expected { parcelas } and always showed 0 items.
  test('lists installments when the API returns a bare array', async () => {
    api.on('GET /v1/cartoes/1002/parcelasFuturas', [
      {
        id: 801,
        descricao: 'Notebook',
        valor: -250,
        data: '2026-02-16',
        parcela: '3/6',
        categoria: 10,
      },
      {
        id: 802,
        descricao: 'Notebook',
        valor: -250,
        data: '2026-03-16',
        parcela: '4/6',
        categoria: 10,
      },
    ]);

    const result = await runCli(['cards', 'future', '-a', '1002', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 801,
        description: 'Notebook',
        date: '2026-02-16',
        value: -250,
        installment: '3/6',
        remaining: 4,
        categoryId: 10,
      },
      {
        id: 802,
        description: 'Notebook',
        date: '2026-03-16',
        value: -250,
        installment: '4/6',
        remaining: 3,
        categoryId: 10,
      },
    ]);
  });

  test('still accepts the legacy { parcelas } wrapper', async () => {
    api.on('GET /v1/cartoes/1002/parcelasFuturas', {
      parcelas: [
        { id: 9, descricao: 'TV', valor: -100, data: '2026-04-16', parcela: '1/2', parcelasRestantes: 2, categoria: 11 },
      ],
      total: -100,
    });

    const result = await runCli(['cards', 'future', '-a', '1002', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 9,
        description: 'TV',
        date: '2026-04-16',
        value: -100,
        installment: '1/2',
        remaining: 2,
        categoryId: 11,
      },
    ]);
  });
});

describe('cards invoice total', () => {
  // Dogfood 2026-10-19: summing items counted the previous invoice's payment
  // (tipo p, positive) and showed +1920.62 instead of totalFatura -3264.53.
  test('header total uses resumo.totalFatura, not the sum of items', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
      ...cardInvoice('2026-01-16', '2026-01-08', -3264.53),
      lancamentos: [
        { id: 1, descricao: 'Pagamento cartão', valor: 5185.15, data: '2025-12-16', categoria: 30, tipo: 'p' },
        { id: 2, descricao: 'Mercado', valor: -50, data: '2026-01-05', categoria: 11, tipo: 'd' },
        { id: 3, descricao: 'VPS', valor: -23, data: '2026-01-04', categoria: 10, tipo: 'd' },
      ],
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-01'], { home, api });

    expect(result.exitCode).toBe(0);
    // Items sum to +5112.15; the bill is -3264.53.
    expect(result.stdout.replace(/\u00a0/g, ' ')).toContain('Total: -R$ 3.264,53');
    expect(result.stdout.replace(/\u00a0/g, ' ')).not.toContain('Total: R$ 5.112,15');
  });

  test('falls back to valor when resumo is missing', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', {
      lancamentos: [
        { id: 1, descricao: 'Pagamento cartão', valor: 100, data: '2025-12-16', tipo: 'p' },
        { id: 2, descricao: 'Mercado', valor: -87.5, data: '2026-01-05', categoria: 11, tipo: 'd' },
      ],
      vencimento: '2026-01-16',
      fechamento: '2026-01-08',
      valor: -87.5,
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-01'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.replace(/\u00a0/g, ' ')).toContain('Total: -R$ 87,50');
  });
});
