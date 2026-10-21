import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type RecordedRequest, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CREDIT_CARD_ACCOUNT, EMPTY_ENTRIES_RESPONSE, cardInvoice } from './fixtures.js';

// Jardinagem 2026-10-21: entries list read one invoice per month per card one
// after the other (a year on two cards: 24 sequential requests).
let api: MockApi;
let home: TestHome;
let inFlight = 0;
let maxInFlight = 0;

const SECOND_CARD = { ...CREDIT_CARD_ACCOUNT, id: 1006, nome: 'Cartão Verde', proximoVencimento: '2026-01-05' };
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

function slowInvoice(due: string, lancamentos: unknown[], ms: number) {
  return async (_req: RecordedRequest) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Bun.sleep(ms);
    inFlight--;
    return { ...cardInvoice(due, `${due.slice(0, 8)}01`), lancamentos };
  };
}

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SECOND_CARD] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  for (const month of MONTHS) {
    for (const [card, day] of [[1002, '16'], [1006, '05']] as const) {
      const due = `2026-${month}-${day}`;
      api.on(`GET /v1/cartoes/${card}/fatura/${due}`, slowInvoice(due, [], 20));
    }
  }
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const LIST = ['entries', 'list', '-a', '1002,1006', '-f', '2026-01-01', '-t', '2026-12-31', '--json'];

describe('entries list on two cards over a year', () => {
  test('reads the 24 invoices a few at a time, at most 4 in flight', async () => {
    const result = await runCli(LIST, { home, api });

    expect(result.exitCode).toBe(0);
    expect(api.requests.filter((r) => r.path.includes('/fatura/'))).toHaveLength(24);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  test('an item in two invoices is listed once, from the earlier invoice, even when that one answers last', async () => {
    const item = { id: 500, descricao: 'Assinatura', valor: -30, data: '2026-01-02' };
    api.on('GET /v1/cartoes/1002/fatura/2026-01-16', slowInvoice('2026-01-16', [item], 150));
    api.on('GET /v1/cartoes/1002/fatura/2026-02-16', slowInvoice('2026-02-16', [item, { ...item, id: 501, descricao: 'Livro' }], 5));
    api.on('GET /v1/cartoes/1006/fatura/2026-03-05', slowInvoice('2026-03-05', [{ ...item, id: 502, descricao: 'Padaria' }], 5));

    const result = await runCli(LIST, { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).map((e: { id: number; date: string }) => [e.id, e.date])).toEqual([
      [500, '2026-01-16'],
      [501, '2026-02-16'],
      [502, '2026-03-05'],
    ]);
  });
});
