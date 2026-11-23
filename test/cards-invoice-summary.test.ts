import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CREDIT_CARD_ACCOUNT } from './fixtures.js';
import type { CardInvoiceEntry } from '../src/types/index.js';

// Real use 2026-10-19: the web shows an invoice summary (closing, due date,
// previous invoice, payments, to pay, reconciled × unreconciled, limit) that
// the API already sends in resumo; the CLI only printed the items. Field
// names are the ones the web's card screen reads (md.js, resumo.setParams).
let api: MockApi;
let home: TestHome;

const ITEMS: CardInvoiceEntry[] = [
  { id: 123456, descricao: 'Item Parcelado', valor: -123.45, data: '2025-11-19', dataPrevista: '2026-11-16', parcela: '12/18', categoria: 11, tipo: 'd', status: 'nconciliado' },
  { id: 9, descricao: 'Pagamento cartão', valor: 1500, data: '2026-10-16', categoria: 30, tipo: 'p', status: 'conciliado' },
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
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      lancamentos: ITEMS,
      vencimento: '2026-11-16T00:00:00',
      fechamento: '2026-11-05T00:00:00',
      valor: -1000.00,
      resumo: {
        vencimento: '2026-11-16T00:00:00',
        fechamento: '2026-11-05T00:00:00',
        valorFaturaAnterior: -1500,
        pagamentosConf: 1500,
        pagamentosAgen: 200,
        totalFatura: -1000.00,
        totalPagar: -800.00,
        conciliado: -150,
        nconciliado: -850,
        receitas: 40,
        despesas: -1040,
        disponivel: 4000,
      },
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toContain('Invoice for Cartão Teste - 2026-11-16 (2 entries) | Total: -R$ 1.000,00');
    expect(out).toMatch(/Due date\s+2026-11-16\n/);
    expect(out).toMatch(/Closing date\s+2026-11-05\n/);
    expect(out).toMatch(/Previous invoice\s+-R\$ 1\.500,00\n/);
    expect(out).toMatch(/Paid\s+R\$ 1\.500,00\n/);
    expect(out).toMatch(/Scheduled payments\s+R\$ 200,00\n/);
    expect(out).toMatch(/Expenses\s+-R\$ 1\.040,00\n/);
    expect(out).toMatch(/Income\s+R\$ 40,00\n/);
    expect(out).toMatch(/Invoice total\s+-R\$ 1\.000,00\n/);
    expect(out).toMatch(/To pay\s+-R\$ 800,00\n/);
    expect(out).toMatch(/Reconciled\s+-R\$ 150,00\n/);
    expect(out).toMatch(/Unreconciled\s+-R\$ 850,00\n/);
    expect(out).toMatch(/Limit\s+R\$ 5\.000,00\n/);
    expect(out).toMatch(/Available\s+R\$ 4\.000,00\n/);
    // The table lists items by purchase date, as the web does.
    expect(out).toMatch(/Purchase\s+│ Description/);
    expect(out).toMatch(/2025-11-19\s+│ Item Parcelado/);
  });

  test('shows only what the API sends, never a guessed zero', async () => {
    withCard({});
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -123.45,
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toMatch(/Due date\s+2026-11-16\n/);
    expect(out).toMatch(/Closing date\s+2026-11-05\n/);
    expect(out).toMatch(/Invoice total\s+-R\$ 123,45\n/);
    for (const label of ['Previous invoice', 'Paid', 'Scheduled payments', 'To pay', 'Reconciled', 'Limit', 'Available']) {
      expect(out).not.toContain(label);
    }
  });

  test('--json without --summary stays an array of items (option B)', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -123.45,
      resumo: { totalFatura: -123.45, disponivel: 4876.55 },
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: 123456,
        description: 'Item Parcelado',
        date: '2026-11-16',
        dueDate: '2026-11-16',
        purchaseDate: '2025-11-19',
        competenceDate: '2025-11-19',
        value: -123.45,
        categoryId: 11,
        installment: '12/18',
      },
    ]);
  });

  test('--summary without --json prints the summary and leaves the items table out', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      lancamentos: ITEMS,
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -123.45,
      resumo: { totalFatura: -123.45, nconciliado: -123.45, disponivel: 4876.55 },
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = plain(result.stdout);
    expect(out).toContain('Invoice for Cartão Teste - 2026-11-16 (2 entries) | Total: -R$ 123,45');
    expect(out).toMatch(/Unreconciled\s+-R\$ 123,45\n/);
    expect(out).toMatch(/Available\s+R\$ 4\.876,55\n/);
    expect(out).not.toContain('Purchase');
    expect(out).not.toContain('Item Parcelado');
  });
});

describe('cards invoice --json --summary', () => {
  test('prints { invoice, entries } with the resumo in R$ under English names', async () => {
    withCard({ limite: 5000 });
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      id: 777,
      lancamentos: ITEMS,
      vencimento: '2026-11-16T00:00:00',
      fechamento: '2026-11-05T00:00:00',
      valor: -1000.00,
      resumo: {
        vencimento: '2026-11-16T00:00:00',
        fechamento: '2026-11-05T00:00:00',
        valorFaturaAnterior: -1500,
        pagamentosConf: 1500,
        pagamentosAgen: 200,
        totalFatura: -1000.00,
        totalPagar: -800.00,
        conciliado: -150,
        nconciliado: -850,
        receitas: 40,
        despesas: -1040,
        disponivel: 4000,
      },
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11', '--json', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(Object.keys(out).sort()).toEqual(['entries', 'invoice']);
    expect(out.invoice).toEqual({
      id: 777,
      closed: true,
      dueDate: '2026-11-16',
      closingDate: '2026-11-05',
      previousInvoice: -1500,
      paid: 1500,
      scheduledPayments: 200,
      expenses: -1040,
      income: 40,
      total: -1000.00,
      toPay: -800.00,
      reconciled: -150,
      unreconciled: -850,
      limit: 5000,
      available: 4000,
    });
    // Same items as --json alone, payment included.
    expect(out.entries.map((e: { id: number }) => e.id)).toEqual([123456, 9]);
    expect(out.entries[0].purchaseDate).toBe('2025-11-19');
  });

  test('an open invoice without resumo gives nulls, not zeros, and total from valor', async () => {
    withCard({});
    api.on('GET /v1/cartoes/202/fatura/2026-11-16', {
      lancamentos: ITEMS.slice(0, 1),
      vencimento: '2026-11-16',
      fechamento: '2026-11-05',
      valor: -123.45,
    });

    const result = await runCli(['cards', 'invoice', '-a', '202', '--month', '2026-11', '--json', '--summary'], { home, api });

    expect(result.exitCode).toBe(0);
    const { invoice } = JSON.parse(result.stdout);
    expect(invoice.id).toBeNull();
    expect(invoice.closed).toBe(false);
    expect(invoice.dueDate).toBe('2026-11-16');
    expect(invoice.total).toBe(-123.45);
    for (const key of ['previousInvoice', 'paid', 'scheduledPayments', 'toPay', 'reconciled', 'unreconciled', 'limit', 'available']) {
      expect(invoice[key]).toBeNull();
    }
  });
});
