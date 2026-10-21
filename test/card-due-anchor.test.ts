import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CREDIT_CARD_ACCOUNT, EMPTY_ENTRIES_RESPONSE, cardInvoice } from './fixtures.js';

// Jardinagem 2026-10-21: for a card without proximoVencimento, cards invoice
// --month assumed day 10, cards invoice and entries list asked primeiraFatura
// and entries create refused. All of them now take primeiraFatura's day.
let api: MockApi;
let home: TestHome;

function cardPaths(): string[] {
  return api.requests.filter((r) => r.path.startsWith('/v1/cartoes/')).map((r) => r.path);
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', {
    ...ACCOUNTS_RESPONSE,
    items: [{ ...CREDIT_CARD_ACCOUNT, proximoVencimento: undefined, proximoFechamento: undefined }],
  });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/cartoes/1002/primeiraFatura', () => '2026-02-21');
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('card without a next due date', () => {
  test('cards invoice --month takes the due day of the first invoice, not 10', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-05-21', cardInvoice('2026-05-21', '2026-05-11'));

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-05'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Invoice for Cartão Azul - 2026-05-21');
    expect(cardPaths()).toEqual(['/v1/cartoes/1002/primeiraFatura', '/v1/cartoes/1002/fatura/2026-05-21']);
  });

  test('cards invoice without --month shows the first invoice', async () => {
    api.on('GET /v1/cartoes/1002/fatura/2026-02-21', cardInvoice('2026-02-21', '2026-02-11'));

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(cardPaths()).toEqual(['/v1/cartoes/1002/primeiraFatura', '/v1/cartoes/1002/fatura/2026-02-21']);
  });

  test('entries list reads the invoices due on that day', async () => {
    api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
    api.on('GET /v1/cartoes/1002/fatura/2026-03-21', {
      ...cardInvoice('2026-03-21', '2026-03-11'),
      lancamentos: [{ id: 91, descricao: 'Padaria', valor: -12, data: '2026-03-02' }],
    });

    const result = await runCli(['entries', 'list', '-a', '1002', '-f', '2026-03-01', '-t', '2026-03-31', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([expect.objectContaining({ id: 91, date: '2026-03-21' })]);
  });

  test('entries create --invoice puts the purchase on the invoice due that day, where it used to refuse', async () => {
    api.on('POST /v1/lancamentos', { id: 555, descricao: 'Voo', valor: -10, data: '2026-04-05', status: 'confirmado', conta: 1002 });

    const result = await runCli(
      ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-04-05', '--invoice', '2026-04', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toMatchObject({ dataCompetencia: '2026-04-05', dataPrevista: '2026-04-21' });
  });
});
