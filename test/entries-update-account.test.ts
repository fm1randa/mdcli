import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, type MockApi, startMockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT, cardInvoice } from './fixtures.js';

let api: MockApi;
let home: TestHome;

// NuCel (#123): a fixed monthly series on Nubank (1001), scheduled.
const FIXED_OCCURRENCE = {
  id: 80,
  descricao: 'NuCel',
  tipo: 'd',
  valor: -45,
  valorPrevisto: -45,
  data: '2027-01-10',
  dataPrevista: '2027-01-10',
  status: 'agendado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  parcela: 'fixa',
  agendaId: 77,
  agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
  tags: [],
};

// Confirmed on Nubank, not reconciled.
const CONFIRMED_ENTRY = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  valorPrevisto: -12.5,
  valorEfetivo: -12.5,
  data: '2026-01-05',
  dataPrevista: '2026-01-04',
  dataEfetiva: '2026-01-05',
  status: 'confirmado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  tags: [],
};

const INTER_ACCOUNT = { ...CHECKING_ACCOUNT, id: 1006, nome: 'Inter' };
const GOLD_CARD = { ...CREDIT_CARD_ACCOUNT, id: 1005, nome: 'Cartão Ouro', proximoVencimento: '2026-01-10T00:00:00' };

// On Cartão Azul (1002): bought on 2026-01-05, on the invoice due 2026-01-16.
const CARD_PURCHASE = {
  id: 90,
  descricao: 'Livro',
  tipo: 'd',
  valor: -80,
  valorPrevisto: -80,
  data: '2026-01-05',
  dataPrevista: '2026-01-16',
  dataCompetencia: '2026-01-05',
  status: 'nconciliado',
  conciliado: false,
  conta: 1002,
  categoria: 10,
  plastico: 7,
  tags: [],
};

// Nubank (1001) -> Poupança (1004), seen from the destination half: the API
// hands back either half of the pair.
const TRANSFER_DESTINATION_HALF = {
  id: 51,
  descricao: 'Reserva',
  tipo: 't',
  valor: 300,
  valorT: -300,
  data: '2026-01-15',
  dataPrevista: '2026-01-15',
  dataEfetiva: '2026-01-15',
  status: 'conciliado',
  conciliado: true,
  conta: 1004,
  contaT: 1001,
  categoria: 30,
  tags: [],
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT, INTER_ACCOUNT, GOLD_CARD] });
  api.on('GET /v1/lancamentos/51', TRANSFER_DESTINATION_HALF);
  api.on('PUT /v1/lancamentos/51', (req) => ({ ...TRANSFER_DESTINATION_HALF, ...(req.body as object) }));
  api.on('GET /v1/lancamentos/80', FIXED_OCCURRENCE);
  api.on('PUT /v1/lancamentos/80', (req) => ({ ...FIXED_OCCURRENCE, ...(req.body as object) }));
  api.on('GET /v1/lancamentos/70', CONFIRMED_ENTRY);
  api.on('PUT /v1/lancamentos/70', (req) => ({ ...CONFIRMED_ENTRY, ...(req.body as object) }));
  // Cartão Azul (1002): due on the 16th, closing on the 8th.
  api.on('GET /v1/cartoes/1002/fatura/2025-12-16', cardInvoice('2025-12-16', '2025-12-08'));
  api.on('GET /v1/cartoes/1002/fatura/2026-01-16', cardInvoice('2026-01-16', '2026-01-08'));
  api.on('GET /v1/cartoes/1002/fatura/2026-02-16', cardInvoice('2026-02-16', '2026-02-08'));
  api.on('GET /v1/lancamentos/90', CARD_PURCHASE);
  api.on('PUT /v1/lancamentos/90', (req) => ({ ...CARD_PURCHASE, ...(req.body as object) }));
  // Cartão Ouro (1005): due on the 10th, closing on the 2nd.
  api.on('GET /v1/cartoes/1005/fatura/2025-12-10', cardInvoice('2025-12-10', '2025-12-02'));
  api.on('GET /v1/cartoes/1005/fatura/2026-01-10', cardInvoice('2026-01-10', '2026-01-02'));
  api.on('GET /v1/cartoes/1005/fatura/2026-02-10', cardInvoice('2026-02-10', '2026-02-02'));
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1004, name: 'reserva' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function putBody(): Record<string, unknown> {
  const put = mutations(api).find((r) => r.method === 'PUT');
  if (!put) throw new Error('no PUT was sent');
  return put.body as Record<string, unknown>;
}

describe('entries update --account', () => {
  test('moves this and the following occurrences of a fixed series to another account', async () => {
    const result = await runCli(['entries', 'update', '80', '--account', 'reserva', '--scope', 'following'], { home, api });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1004,
      todos: true,
      agendaId: 77,
      parcela: 'fixa',
      dataPrevista: '2027-01-10',
      status: { confirmado: false, conciliado: false },
    });
    expect(putBody()).not.toHaveProperty('dataEfetiva');
    expect(result.stdout).toContain('Account: 1004');
    expect(result.stdout).toContain('Scope: this and the following occurrences');
  });

  test('refuses an entry on a closed invoice, as the web app locks its account', async () => {
    api.on('GET /v1/lancamentos/81', { ...FIXED_OCCURRENCE, id: 81, conta: 1002, status: 'nconciliado', fatura: 3141 });

    const result = await runCli(['entries', 'update', '81', '--account', '1001', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Entry 81 is on a closed invoice, so its account cannot be changed');
    expect(mutations(api)).toEqual([]);
  });

  test('--to-account only applies to transfers', async () => {
    const result = await runCli(['entries', 'update', '80', '--to-account', '1004', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--to-account only applies to transfers');
    expect(mutations(api)).toEqual([]);
  });
});

describe('entries update --account on a transfer', () => {
  test('--account moves the origin and --to-account the destination', async () => {
    const result = await runCli(['entries', 'update', '51', '--account', 'Inter', '--to-account', '1001', '--json'], { home, api });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      transferencia: true,
      contaOrigem: 1006,
      contaDestino: 1001,
      conta: 1006,
      contaT: 1001,
      valor: -300,
      valorT: 300,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ conta: 1006, contaT: 1001 });
  });

  test('--to-account alone keeps the origin', async () => {
    const result = await runCli(['entries', 'update', '51', '--to-account', 'Inter'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ contaOrigem: 1001, contaDestino: 1006 });
    expect(result.stdout).toContain('To account: 1006');
  });

  test('refuses the same account on both sides, as the web app does', async () => {
    const result = await runCli(['entries', 'update', '51', '--account', 'reserva'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('origin and destination would both be account 1004');
    expect(mutations(api)).toEqual([]);
  });

  test('refuses moving either side to a credit card', async () => {
    const result = await runCli(['entries', 'update', '51', '--to-account', '1002'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Transfers to or from a credit card account are not supported');
    expect(mutations(api)).toEqual([]);
  });
});

describe('entries update --account to or from a credit card', () => {
  test('to a card: the purchase goes to the invoice of its date, unreconciled and without an effective date', async () => {
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

  test('to another card: the invoice is picked again and the old card plastic is dropped', async () => {
    const result = await runCli(['entries', 'update', '90', '-a', 'Cartão Ouro'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = putBody();
    expect(body).toMatchObject({ conta: 1005, dataCompetencia: '2026-01-05', dataPrevista: '2026-02-10', dataEfetiva: null });
    expect(body).not.toHaveProperty('plastico');
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
});
