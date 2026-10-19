import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CREDIT_CARD_ACCOUNT } from './fixtures.js';

// Dogfood 2026-10-19: the web shows an invoice summary (closing, due date,
// previous invoice, payments, to pay, reconciled × unreconciled, limit) that
// the API already sends in resumo; the CLI only printed the items. Field
// names are the ones the web's card screen reads (md.js, resumo.setParams).
let api: MockApi;
let home: TestHome;

const ITEMS = [
  { id: 315471241, descricao: 'Mac mini M4', valor: -301.29, data: '2025-11-19', dataPrevista: '2026-11-16', parcela: '12/18', categoria: 11, tipo: 'd', status: 'nconciliado' },
  { id: 9, descricao: 'Pagamento cartão', valor: 1520.4, data: '2026-10-16', categoria: 30, tipo: 'p', status: 'conciliado' },
];

const plain = (text: string): string => text.replace(/\u00a0/g, ' ');

beforeEach(() => {
  api = startMockApi();
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function withCard(card: Record<string, unknown>): void {
  api.on('GET /v1/cadastros/contas', {
    ...ACCOUNTS_RESPONSE,
    items: [{ ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-11-16', proximoFechamento: '2026-11-05', ...card }],
  });
}

describe('cards invoice summary (text)', () => {
  test('shows the resumo the web shows, with the limit from the card', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      lancamentos: ITEMS,
      vencimento: '2026-11-16T00:00:00',
      fechamento: '2026-11-05T00:00:00',
      valor: -980.75,
      resumo: {
        vencimento: '2026-11-16T00:00:00',
        fechamento: '2026-11-05T00:00:00',
        valorFaturaAnterior: -1520.4,
        pagamentosConf: 1520.4,
        pagamentosAgen: 200,
        totalFatura: -980.75,
        totalPagar: -780.75,
        conciliado: -120,
        nconciliado: -860.75,
        receitas: 35.1,
        despesas: -1015.85,
        disponivel: 4019.25,
      },
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toContain('Invoice for Cartão Azul - 2026-11-16 (2 entries) | Total: -R$ 980,75');
    expect(out).toMatch(/Due date\s+2026-11-16\n/);
    expect(out).toMatch(/Closing date\s+2026-11-05\n/);
    expect(out).toMatch(/Previous invoice\s+-R\$ 1\.520,40\n/);
    expect(out).toMatch(/Paid\s+R\$ 1\.520,40\n/);
    expect(out).toMatch(/Scheduled payments\s+R\$ 200,00\n/);
    expect(out).toMatch(/Expenses\s+-R\$ 1\.015,85\n/);
    expect(out).toMatch(/Income\s+R\$ 35,10\n/);
    expect(out).toMatch(/Invoice total\s+-R\$ 980,75\n/);
    expect(out).toMatch(/To pay\s+-R\$ 780,75\n/);
    expect(out).toMatch(/Reconciled\s+-R\$ 120,00\n/);
    expect(out).toMatch(/Unreconciled\s+-R\$ 860,75\n/);
    expect(out).toMatch(/Limit\s+R\$ 5\.000,00\n/);
    expect(out).toMatch(/Available\s+R\$ 4\.019,25\n/);
    // The table lists items by purchase date, as the web does.
    expect(out).toMatch(/Purchase\s+│ Description/);
    expect(out).toMatch(/2025-11-19\s+│ Mac mini M4/);
  });

  test('shows only what the API sends, never a guessed zero', async () => {
    withCard({});
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -301.29,
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toMatch(/Due date\s+2026-11-16\n/);
    expect(out).toMatch(/Closing date\s+2026-11-05\n/);
    expect(out).toMatch(/Invoice total\s+-R\$ 301,29\n/);
    for (const label of ['Previous invoice', 'Paid', 'Scheduled payments', 'To pay', 'Reconciled', 'Limit', 'Available']) {
      expect(out).not.toContain(label);
    }
  });

  test('--json without --summary stays an array of items (option B)', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -301.29,
      resumo: { totalFatura: -301.29, disponivel: 4698.71 },
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 315471241,
        description: 'Mac mini M4',
        date: '2026-11-16',
        dueDate: '2026-11-16',
        purchaseDate: '2025-11-19',
        competenceDate: '2025-11-19',
        value: -301.29,
        categoryId: 11,
        installment: '12/18',
      },
    ]);
  });

  test('--summary without --json prints the summary and leaves the items table out', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      lancamentos: ITEMS,
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -301.29,
      resumo: { totalFatura: -301.29, nconciliado: -301.29, disponivel: 4698.71 },
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toContain('Invoice for Cartão Azul - 2026-11-16 (2 entries) | Total: -R$ 301,29');
    expect(out).toMatch(/Unreconciled\s+-R\$ 301,29\n/);
    expect(out).toMatch(/Available\s+R\$ 4\.698,71\n/);
    expect(out).not.toContain('Purchase');
    expect(out).not.toContain('Mac mini M4');
  });
});

describe('cards invoice --json --summary', () => {
  test('prints { invoice, entries } with the resumo in R$ under English names', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      id: 777,
      lancamentos: ITEMS,
      vencimento: '2026-11-16T00:00:00',
      fechamento: '2026-11-05T00:00:00',
      valor: -980.75,
      resumo: {
        vencimento: '2026-11-16T00:00:00',
        fechamento: '2026-11-05T00:00:00',
        valorFaturaAnterior: -1520.4,
        pagamentosConf: 1520.4,
        pagamentosAgen: 200,
        totalFatura: -980.75,
        totalPagar: -780.75,
        conciliado: -120,
        nconciliado: -860.75,
        receitas: 35.1,
        despesas: -1015.85,
        disponivel: 4019.25,
      },
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11', '--json', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(Object.keys(out).sort()).toEqual(['entries', 'invoice']);
    expect(out.invoice).toEqual({
      id: 777,
      closed: true,
      dueDate: '2026-11-16',
      closingDate: '2026-11-05',
      previousInvoice: -1520.4,
      paid: 1520.4,
      scheduledPayments: 200,
      expenses: -1015.85,
      income: 35.1,
      total: -980.75,
      toPay: -780.75,
      reconciled: -120,
      unreconciled: -860.75,
      limit: 5000,
      available: 4019.25,
    });
    // Same items as --json alone, payment included.
    expect(out.entries.map((e: { id: number }) => e.id)).toEqual([315471241, 9]);
    expect(out.entries[0].purchaseDate).toBe('2025-11-19');
  });

  test('an open invoice without resumo gives nulls, not zeros, and total from valor', async () => {
    withCard({});
    api.on('GET /v1/cartoes/1002/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -301.29,
    });

    const result = await runCli(['cards', 'invoice', '-a', '1002', '--month', '2026-11', '--json', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const { invoice } = JSON.parse(result.stdout);
    expect(invoice.id).toBeNull();
    expect(invoice.closed).toBe(false);
    expect(invoice.dueDate).toBe('2026-11-16');
    expect(invoice.total).toBe(-301.29);
    for (const key of ['previousInvoice', 'paid', 'scheduledPayments', 'toPay', 'reconciled', 'unreconciled', 'limit', 'available']) {
      expect(invoice[key]).toBeNull();
    }
  });
});
