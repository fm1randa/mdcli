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
