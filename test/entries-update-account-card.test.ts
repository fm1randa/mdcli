import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mutations, runCli, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT } from './fixtures.js';
import { BLUE_CARD, CARD_PURCHASE, CONFIRMED_ENTRY, FIXED_OCCURRENCE, putBody as sentPut, startUpdateAccountApi } from './update-account-harness.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  ({ api, home } = startUpdateAccountApi());
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const putBody = (): Record<string, unknown> => sentPut(api);

describe('entries update --account to or from a credit card', () => {
  test('to a card: a confirmed, unreconciled entry goes to the invoice of its date with confirmado = conciliado (false) and no effective date', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', 'Cartão Azul', '--json'], { home, api });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1002,
      data: '2026-01-05',
      dataCompetencia: '2026-01-05',
      dataPrevista: '2026-01-16',
      dataEfetiva: null,
      valorEfetivo: null,
      status: { confirmado: false, conciliado: false },
      conciliado: false,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ conta: 1002, dataPrevista: '2026-01-16' });
  });

  test('to a card: a reconciled occurrence of an endless series stays reconciled with its effective date', async () => {
    api.on('GET /v1/lancamentos/82', {
      ...FIXED_OCCURRENCE,
      id: 82,
      data: '2026-01-05',
      dataPrevista: '2026-01-05',
      dataEfetiva: '2026-01-05',
      valorEfetivo: -45,
      status: 'conciliado',
      conciliado: true,
    });
    api.on('PUT /v1/lancamentos/82', (req) => req.body as object);

    const result = await runCli(['entries', 'update', '82', '-a', '1002', '--scope', 'following'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1002,
      todos: true,
      dataCompetencia: '2026-01-05',
      dataPrevista: '2026-01-16',
      dataEfetiva: '2026-01-05',
      valorEfetivo: -45,
      status: { confirmado: true, conciliado: true },
    });
  });

  test('to a card: -D sets the purchase date the invoice is picked from', async () => {
    const result = await runCli(['entries', 'update', '70', '-a', '1002', '-D', '2026-01-10'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ dataCompetencia: '2026-01-10', dataPrevista: '2026-02-16' });
  });

  test('to a card: -r is refused, the CLI does not reconcile card purchases', async () => {
    const result = await runCli(['entries', 'update', '70', '-a', '1002', '-r'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('does not reconcile card purchases');
    expect(mutations(api)).toEqual([]);
  });

  test('to another card without a holder plastic: the invoice is picked again and the old plastic is cleared', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', 'Cartão Ouro'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1005,
      dataCompetencia: '2026-01-05',
      dataPrevista: '2026-02-10',
      dataEfetiva: null,
      plastico: null,
    });
  });

  test('off a card: an unreconciled purchase becomes pending on its purchase date', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', '1001'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1001,
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataPrevista: '2026-01-05',
      dataEfetiva: null,
      valorEfetivo: null,
    });
  });

  test('off a card: a reconciled purchase stays reconciled, effective on its purchase date', async () => {
    api.on('GET /v1/lancamentos/90', { ...CARD_PURCHASE, status: 'conciliado', conciliado: true });

    const result = await runCli(['entries', 'update', '90', '-a', '1001'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      status: { confirmado: true, conciliado: true },
      dataEfetiva: '2026-01-05',
      dataPrevista: '2026-01-16',
      valorEfetivo: -80,
    });
  });

  test('off a card: --confirmed confirms the purchase on its purchase date', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', '1001', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      status: { confirmado: true, conciliado: false },
      dataEfetiva: '2026-01-05',
      valorEfetivo: -80,
    });
  });

  test('the same card again changes nothing but is still saved', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', '1002'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ conta: 1002, dataPrevista: '2026-01-16', plastico: 7 });
    expect(api.requests.some((r) => r.path.startsWith('/v1/cartoes/'))).toBe(false);
  });

  test('to a card: a date before the next due date goes to the next invoice, never an earlier one', async () => {
    const result = await runCli(['entries', 'update', '70', '-a', '1002', '-D', '2025-10-20'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ dataCompetencia: '2025-10-20', dataPrevista: '2026-01-16' });
  });

  test('to a card: an installment series starting past installment 1 counts the date from that installment', async () => {
    api.on('GET /v1/lancamentos/83', {
      ...CONFIRMED_ENTRY,
      id: 83,
      parcela: '3/6',
      agendaId: 78,
      agenda: { frequencia: 1, intervalo: 'M', quantidade: 6, inicial: 3, primeiraData: '2026-01-05' },
    });
    api.on('PUT /v1/lancamentos/83', (req) => req.body as object);

    const result = await runCli(['entries', 'update', '83', '-a', '1002', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ dataCompetencia: '2026-01-05', dataPrevista: '2026-03-16' });
  });

  test('to a card: the due day clamped at a month end stays clamped month after month, as moment adds months', async () => {
    const endOfMonthCard = { ...BLUE_CARD, id: 1007, nome: 'Cartão Fim', proximoVencimento: '2026-01-31T00:00:00' };
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, endOfMonthCard] });

    const result = await runCli(['entries', 'update', '70', '-a', '1007', '-D', '2026-03-30'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ dataPrevista: '2026-04-28' });
  });

  test("to a card: the purchase goes on the new card's holder plastic", async () => {
    api.on('GET /v1/cadastros/plasticos', [
      { id: 31, conta: 1005, tipo: 'T', titular: true, nome: 'Ana', status: true },
      { id: 22, conta: 1002, tipo: 'A', titular: false, nome: 'Ana', status: true },
      { id: 21, conta: 1002, tipo: 'T', titular: true, nome: 'Bia', status: true },
    ]);

    const result = await runCli(['entries', 'update', '70', '-a', '1002'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ conta: 1002, plastico: 21 });
  });

  test('to a card: an inactive holder plastic is skipped', async () => {
    api.on('GET /v1/cadastros/plasticos', [
      { id: 21, conta: 1002, tipo: 'T', titular: true, nome: 'Bia', status: false },
      { id: 24, conta: 1002, tipo: 'T', titular: true, nome: 'Carla', status: true },
    ]);

    const result = await runCli(['entries', 'update', '70', '-a', '1002'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ plastico: 24 });
  });

  test('to a card: with two holder plastics, the first by name is picked, as the web lists them', async () => {
    api.on('GET /v1/cadastros/plasticos', [
      { id: 25, conta: 1002, tipo: 'T', titular: true, nome: 'zé', status: true },
      { id: 24, conta: 1002, tipo: 'T', titular: true, nome: 'Carla', status: true },
    ]);

    const result = await runCli(['entries', 'update', '70', '-a', '1002'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ plastico: 24 });
  });

  test('off a card: the purchase competence date is not sent when the entry has no recognition date', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', '1001'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).not.toHaveProperty('dataCompetencia');
  });

  test('off a card: an unconfirmed purchase dated up to today no longer confirms itself automatically', async () => {
    api.on('GET /v1/lancamentos/90', { ...CARD_PURCHASE, automatico: true });

    const result = await runCli(['entries', 'update', '90', '-a', '1001'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ status: { confirmado: false, conciliado: false }, automatico: false });
  });
});
