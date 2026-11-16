import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, offContract, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT } from './fixtures.js';
import { SINCE } from './import-harness.js';

// Issue #296. The card's next due date is 2026-03-16. Earlier dues step back on day 16.
const CARD = { ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-03-16T00:00:00', proximoFechamento: '2026-03-05T00:00:00' };
const CARD_LINK = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 302, type: 'CONTA CORRENTE', conta: 202 }] },
];
const CURRENT = '/v1/cartoes/202/fatura/2026-03-16';
const ONE_BACK = '/v1/cartoes/202/fatura/2026-02-16';
const TWO_BACK = '/v1/cartoes/202/fatura/2026-01-16';
const THREE_BACK = '/v1/cartoes/202/fatura/2025-12-16';
const STEP_24 = '/v1/cartoes/202/fatura/2024-03-16';
const STEP_25 = '/v1/cartoes/202/fatura/2024-02-16';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CARD_LINK);
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, CARD] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function item(id: number, date: string) {
  return { id, descricao: 'Compra Teste', valor: -10, data: date, dataCompetencia: date, categoria: 10 };
}

function invoice(vencimento: string, fechamento: string, items: ReturnType<typeof item>[] = []) {
  return { vencimento, fechamento, valor: 0, lancamentos: items };
}

function statement(date: string) {
  api.on('GET /v1/integracao/account/302/transactions', {
    inicio: '2024-01-01',
    fim: '2026-03-16',
    saldo: 0,
    lancamentos: [{ integrationId: '81818181-1111-4000-8000-000000000001', descricao: 'Compra Teste', valor: -10, data: date, moeda: 1 }],
  });
}

function invoicePaths(): string[] {
  return api.requests.filter((request) => request.path.startsWith('/v1/cartoes/202/fatura/')).map((request) => request.path);
}

async function candidateIds(): Promise<number[]> {
  const result = await runCli(['entries', 'import', 'list', '-a', '202', '--since', SINCE, '--json'], { home, api });
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  expect(mutations(api)).toHaveLength(0);
  const transactions = JSON.parse(result.stdout).transactions as { candidates: { id: number }[] }[];
  return transactions.flatMap((row) => row.candidates.map((candidate) => candidate.id));
}

/** Day 16 of the month `offset` months from 2026-03. -24 is 2024-03-16. */
function dueMonthsBack(offset: number): string {
  const index = 2026 * 12 + 2 + offset;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-16`;
}

describe('entries import list stops the earlier-invoice walk (#296)', () => {
  test('a purchase two invoices back is listed from that invoice and the one after it, and the third is not read', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-05', [item(201, '2026-02-01')]));
    api.on(`GET ${TWO_BACK}`, invoice('2026-01-16', '2026-01-05', [item(101, '2026-01-05')]));
    api.on(`GET ${THREE_BACK}`, invoice('2025-12-16', '2025-12-05', [item(301, '2025-12-01')]));
    statement('2026-01-05');

    const ids = await candidateIds();

    expect(ids).toContain(101);
    expect(ids).toContain(201);
    expect(ids).not.toContain(301);
    expect(invoicePaths()).toContain(TWO_BACK);
    expect(invoicePaths()).toContain(ONE_BACK);
    expect(invoicePaths()).not.toContain(THREE_BACK);
  });

  test('an earlier invoice that closed before the purchase is read and then left out, and the one before it is not read', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-01', [item(777, '2026-01-20')]));
    api.on(`GET ${TWO_BACK}`, invoice('2026-01-16', '2026-01-05', [item(301, '2026-01-05')]));
    statement('2026-02-10');

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(ids).not.toContain(777);
    expect(invoicePaths()).toContain(ONE_BACK);
    expect(invoicePaths()).not.toContain(TWO_BACK);
  });

  test('an earlier invoice with no closing date contributes no candidate and stops the walk', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, offContract({
      vencimento: '2026-02-16', fechamento: null, valor: 0, lancamentos: [item(778, '2026-02-01')],
    }));
    api.on(`GET ${TWO_BACK}`, invoice('2026-01-16', '2026-01-05', [item(301, '2026-01-05')]));
    statement('2026-02-10');

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(ids).not.toContain(778);
    expect(invoicePaths()).toContain(ONE_BACK);
    expect(invoicePaths()).not.toContain(TWO_BACK);
  });

  test('a current invoice with no closing date is listed and no earlier invoice is read', async () => {
    api.on(`GET ${CURRENT}`, offContract({
      vencimento: '2026-03-16', fechamento: null, valor: 0, lancamentos: [item(100, '2026-03-01')],
    }));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-05', [item(201, '2026-02-10')]));
    statement('2026-02-10');

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(ids).not.toContain(201);
    expect(invoicePaths()).toContain(CURRENT);
    expect(invoicePaths()).not.toContain(ONE_BACK);
  });

  test('a bank row with no purchase date lists the current invoice and does not read an earlier one', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-05', [item(201, '2026-02-10')]));
    api.on('GET /v1/integracao/account/302/transactions', offContract({
      inicio: '2026-01-01',
      fim: '2026-03-16',
      saldo: 0,
      lancamentos: [{ integrationId: '81818181-1111-4000-8000-000000000002', descricao: 'Compra Teste', valor: -10, data: null, moeda: 1 }],
    }));

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(ids).not.toContain(201);
    expect(invoicePaths()).toContain(CURRENT);
    expect(invoicePaths()).not.toContain(ONE_BACK);
  });

  test('the walk reads 24 earlier invoices and does not read the 25th', async () => {
    for (let offset = 0; offset >= -25; offset--) {
      const due = dueMonthsBack(offset);
      const items = offset === -24 ? [item(2400, '2024-03-01')] : offset === -25 ? [item(2500, '2024-02-01')] : [];
      api.on(`GET /v1/cartoes/202/fatura/${due}`, invoice(due, '2026-03-05', items));
    }
    statement('2026-02-10');

    const ids = await candidateIds();

    expect(ids).toContain(2400);
    expect(ids).not.toContain(2500);
    expect(invoicePaths()).toContain(CURRENT);
    expect(invoicePaths()).toContain(STEP_24);
    expect(invoicePaths()).not.toContain(STEP_25);
  });

  test('a purchase eight days after the guessed previous closing does not read that invoice', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-05'));
    statement('2026-02-13');

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(invoicePaths()).toContain(CURRENT);
    expect(invoicePaths()).not.toContain(ONE_BACK);
  });

  test('a purchase seven days after the guessed previous closing reads that invoice', async () => {
    api.on(`GET ${CURRENT}`, invoice('2026-03-16', '2026-03-05', [item(100, '2026-03-01')]));
    api.on(`GET ${ONE_BACK}`, invoice('2026-02-16', '2026-02-05'));
    statement('2026-02-12');

    const ids = await candidateIds();

    expect(ids).toContain(100);
    expect(invoicePaths()).toContain(ONE_BACK);
  });
});
