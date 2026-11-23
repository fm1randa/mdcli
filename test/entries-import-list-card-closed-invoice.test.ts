import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT } from './fixtures.js';
import { SINCE, type BankTransaction } from './import-harness.js';

// Issue #281, synthetic dates. Invoice A (due 2026-02-16) closed on 2026-02-05, so the card's
// proximoVencimento already moved to invoice B (due 2026-03-16). The purchases below fall in A.
const CARD = { ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-03-16T00:00:00', proximoFechamento: '2026-03-05T00:00:00' };
const CARD_LINK = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 302, type: 'CONTA CORRENTE', conta: 202 }] },
];
const IMPORTED_TX = '71717171-1111-4000-8000-000000000001';
const CONCILIATED_TX = '72727272-2222-4000-8000-000000000002';
const INVOICE_A = '/v1/cartoes/202/fatura/2026-02-16';
const INVOICE_B = '/v1/cartoes/202/fatura/2026-03-16';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CARD_LINK);
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, CARD] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on(`GET ${INVOICE_A}`, {
    vencimento: '2026-02-16',
    fechamento: '2026-02-05',
    valor: -65,
    id: 61,
    lancamentos: [
      // Imported from IMPORTED_TX and reconciled; the bank's date is not its competence date.
      {
        id: 901, descricao: 'Compra Importada', valor: -20, data: '2026-01-26', dataCompetencia: '2026-01-26',
        status: 'conciliado', categoria: 10, fatura: 61, integrationId: IMPORTED_TX,
      },
      // Reconciled with CONCILIATED_TX on its own day.
      {
        id: 902, descricao: 'Compra Conciliada', valor: -45, data: '2026-02-03', dataCompetencia: '2026-02-03',
        status: 'conciliado', categoria: 10, fatura: 61,
      },
    ],
  });
  api.on(`GET ${INVOICE_B}`, {
    vencimento: '2026-03-16',
    fechamento: '2026-03-05',
    valor: -45,
    // Another purchase of the same value, two days after CONCILIATED_TX.
    lancamentos: [
      { id: 911, descricao: 'Outra Compra', valor: -45, data: '2026-02-05', dataCompetencia: '2026-02-05', categoria: 10 },
    ],
  });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function statement(rows: BankTransaction[]) {
  api.on('GET /v1/integracao/account/302/transactions', {
    inicio: '2026-01-25', fim: '2026-02-10', saldo: 0, lancamentos: rows,
  });
}

async function listed() {
  const result = await runCli(['entries', 'import', 'list', '-a', '202', '--since', SINCE, '--json'], { home, api });
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  expect(mutations(api)).toHaveLength(0);
  return JSON.parse(result.stdout).transactions;
}

describe('entries import list on a card after its invoice closed (#281)', () => {
  test('a purchase already imported into the closed invoice is recognized by its bank id, not imported again', async () => {
    statement([{ integrationId: IMPORTED_TX, descricao: 'Compra A', valor: -20, data: '2026-01-30', moeda: 1 }]);

    const [row] = await listed();

    expect(row.entry).toBe(901);
    expect(row.alreadyConciliated).toBe(true);
    expect(row.action).toBe('conciliate');
    expect(row.candidates.map((item: { id: number }) => item.id)).toEqual([901, 911]);
    expect(api.requests.some((r) => r.path === INVOICE_A)).toBe(true);
  });

  test('a purchase reconciled in the closed invoice is not matched to a same-value item of the next one', async () => {
    statement([{ integrationId: CONCILIATED_TX, descricao: 'Compra B', valor: -45, data: '2026-02-03', moeda: 1 }]);

    const [row] = await listed();

    expect(row.entry).toBe(902);
    expect(row.alreadyConciliated).toBe(true);
    expect(row.action).toBe('conciliate');
    expect(row.candidates.map((item: { id: number }) => item.id)).toEqual([902, 911]);
  });
});
