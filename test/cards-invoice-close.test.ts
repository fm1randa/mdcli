import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT } from './fixtures.js';

// Issue #324: the web's "Fechar fatura" (POST /cartoes/:id/pagar) and "Reabrir fatura"
// (POST /cartoes/:id/reabrir), mdb.js cartoesService and PagarFaturaController. Synthetic values.
const CARD = { ...CREDIT_CARD_ACCOUNT, contada: 201 };
const OPEN_INVOICE = '/v1/cartoes/202/fatura/2026-01-16';
const LAST_CLOSED_INVOICE = '/v1/cartoes/202/fatura/2025-12-16';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, CARD, SAVINGS_ACCOUNT] });
  // -300 of purchases, 100 of it already scheduled to be paid.
  api.on(`GET ${OPEN_INVOICE}`, {
    vencimento: '2026-01-16T00:00:00', fechamento: '2026-01-08T00:00:00', valor: -300, pagamentosAgendados: 100, lancamentos: [],
  });
  api.on(`GET ${LAST_CLOSED_INVOICE}`, {
    id: 55, vencimento: '2025-12-16T00:00:00', fechamento: '2025-12-08T00:00:00', valor: -80, lancamentos: [],
  });
  api.on('POST /v1/cartoes/202/pagar', { conta: 202, vencimento: '2026-01-16T00:00:00' });
  api.on('POST /v1/cartoes/202/reabrir', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const cli = (args: string[], stdin?: string) => runCli(['--lang', 'en', 'cards', 'invoice', ...args], { home, api, stdin });

describe('cards invoice close', () => {
  test('sends the web close: what is left to pay, from the card payment account, on the due date', async () => {
    const result = await cli(['close', '-a', '202', '--dangerously-skip-confirmation']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Invoice of Cartão Teste due 2026-01-16 closed');
    expect(mutations(api).map((r) => [r.method, r.path, r.body])).toEqual([
      ['POST', '/v1/cartoes/202/pagar', {
        conta: 202,
        data: '2026-01-16',
        valor: -200,
        contaT: '201',
        confirmado: true,
        automatico: false,
        vencimento: '2026-01-16T00:00:00',
        anexos: [],
        lembrete: 0,
      }],
    ]);
  });

  test('--from, --date and --no-payment change the paying account, the date and the amount', async () => {
    const result = await cli(['close', '-a', '202', '--from', '204', '--date', '2026-01-20', '--no-payment', '--dangerously-skip-confirmation', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ closed: true, dueDate: '2026-01-16', response: { conta: 202 } });
    expect(mutations(api).map((r) => r.body)).toEqual([
      expect.objectContaining({ contaT: '204', data: '2026-01-20', valor: 0 }),
    ]);
  });

  test('schedules nothing when the scheduled payments already cover the bill', async () => {
    api.on(`GET ${OPEN_INVOICE}`, {
      vencimento: '2026-01-16T00:00:00', fechamento: '2026-01-08T00:00:00', valor: -300, pagamentosAgendados: 300, lancamentos: [],
    });

    const result = await cli(['close', '-a', '202', '--dangerously-skip-confirmation']);

    expect(result.exitCode).toBe(0);
    expect(mutations(api).map((r) => r.body)).toEqual([expect.objectContaining({ valor: 0 })]);
  });

  test('--dry-run prints the request and writes nothing', async () => {
    const result = await cli(['close', '-a', '202', '--dry-run', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      dryRun: true,
      request: expect.objectContaining({ conta: 202, valor: -200, contaT: '201', vencimento: '2026-01-16T00:00:00' }),
    });
    expect(mutations(api)).toHaveLength(0);
  });

  test('a "no" at the prompt writes nothing', async () => {
    const result = await cli(['close', '-a', '202'], 'n\n');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Write cancelled.');
    expect(mutations(api)).toHaveLength(0);
  });

  test.each([
    [['close', '-a', '202', '--json'], '--json does not prompt'],
    [['close', '-a', '202', '--month', '2026-02', '--dangerously-skip-confirmation'], 'drop --month'],
    [['close', '-a', '202', '--from', '202', '--dangerously-skip-confirmation'], 'Account 202 is a credit card'],
    [['close', '-a', '202', '--date', '2026-02-30', '--dangerously-skip-confirmation'], 'Invalid date'],
    [['close', '-a', '201', '--dangerously-skip-confirmation'], 'Account 201 is not a credit card'],
  ])('refuses %p without writing', async (args, message) => {
    const result = await cli(args);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(message);
    expect(mutations(api)).toHaveLength(0);
  });

  test('refuses an invoice that is already closed', async () => {
    api.on(`GET ${OPEN_INVOICE}`, {
      id: 56, vencimento: '2026-01-16T00:00:00', fechamento: '2026-01-08T00:00:00', valor: -300, lancamentos: [],
    });

    const result = await cli(['close', '-a', '202', '--dangerously-skip-confirmation']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('The invoice of Cartão Teste due 2026-01-16 is already closed.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a card without a payment account needs --from', async () => {
    api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT] });

    const result = await cli(['close', '-a', '202', '--dangerously-skip-confirmation']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Card 202 has no payment account');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('cards invoice reopen', () => {
  test('reopens the last closed invoice with the vencimento the API gave it', async () => {
    const result = await cli(['reopen', '-a', '202', '--dangerously-skip-confirmation']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Invoice of Cartão Teste due 2025-12-16 reopened');
    expect(mutations(api).map((r) => [r.method, r.path, r.body])).toEqual([
      ['POST', '/v1/cartoes/202/reabrir', { vencimento: '2025-12-16T00:00:00' }],
    ]);
  });

  test('refuses an invoice that is not closed', async () => {
    const result = await cli(['reopen', '-a', '202', '--month', '2026-01', '--dangerously-skip-confirmation']);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('The invoice of Cartão Teste due 2026-01-16 is not closed.');
    expect(mutations(api)).toHaveLength(0);
  });

  test('--dry-run writes nothing', async () => {
    const result = await cli(['reopen', '-a', '202', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dry run, nothing written: Reopen the invoice of Cartão Teste (202) due 2025-12-16.');
    expect(mutations(api)).toHaveLength(0);
  });
});
