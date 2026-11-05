// GET /v1/cartoes/:id/... for scripts/mock-api.ts: invoice, future installments
// and the first invoice date.
import type { CardFutureResponse, CardInvoiceResponse } from '../src/types/index.js';
import { cardInvoice } from '../test/fixtures.js';
import { invoiceItems } from './mock-entries.js';

const sum = (items: ReadonlyArray<{ valor: unknown }>): number =>
  Math.round(items.reduce((total, e) => total + Number(e.valor), 0) * 100) / 100;

/** Closing date ~8 days before due, matching the unit-test fixtures. */
function closingFor(dueDate: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  const closing = new Date(y, m - 1, d - 8);
  const yy = closing.getFullYear();
  const mm = String(closing.getMonth() + 1).padStart(2, '0');
  const dd = String(closing.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * valor and resumo of a mock invoice, with the resumo field names the web app
 * reads (md.js, resumo.setParams). Bill total excludes payments (tipo p),
 * matching resumo.totalFatura on the real API (real use 2026-10-19); the
 * payments listed in an invoice paid the previous one.
 */
function invoiceTotals(
  lancamentos: ReadonlyArray<{ valor: unknown; tipo?: string; status?: string }>,
  vencimento: string,
  fechamento: string,
  limite: number | undefined
) {
  const purchases = lancamentos.filter((e) => e.tipo !== 'p');
  const payments = lancamentos.filter((e) => e.tipo === 'p');
  const totalFatura = sum(purchases);
  return {
    valor: totalFatura,
    resumo: {
      vencimento,
      fechamento,
      valorFaturaAnterior: -sum(payments),
      pagamentosConf: sum(payments.filter((e) => e.status === 'conciliado')),
      pagamentosAgen: sum(payments.filter((e) => e.status !== 'conciliado')),
      totalFatura,
      totalPagar: totalFatura,
      conciliado: sum(purchases.filter((e) => e.status === 'conciliado')),
      nconciliado: sum(purchases.filter((e) => e.status !== 'conciliado')),
      receitas: sum(purchases.filter((e) => Number(e.valor) > 0)),
      despesas: sum(purchases.filter((e) => Number(e.valor) < 0)),
      ...(limite === undefined ? {} : { disponivel: Math.round((limite + totalFatura) * 100) / 100 }),
    },
  };
}

/** The card requests of a mock server, or null for any other request. */
export function cardsRoute(
  req: Request,
  path: string,
  isCreditCard: (id: number) => boolean,
  limitOf: (id: number) => number | undefined
): Response | null {
  if (req.method !== 'GET') return null;

  const first = path.match(/^\/api\/v1\/cartoes\/(\d+)\/primeiraFatura$/);
  if (first) {
    if (!isCreditCard(Number(first[1]))) return Response.json({ message: 'not found' }, { status: 404 });
    // ISO date string (what fetchFirstInvoiceDate expects).
    return Response.json('2026-01-16');
  }

  const invoice = path.match(/^\/api\/v1\/cartoes\/(\d+)\/fatura\/(\d{4}-\d{2}-\d{2})$/);
  if (invoice) {
    const id = Number(invoice[1]);
    const due = invoice[2];
    if (!isCreditCard(id)) return Response.json({ message: 'not found' }, { status: 404 });
    const lancamentos = invoiceItems(id, due);
    const invoiceBody: CardInvoiceResponse = {
      ...cardInvoice(due, closingFor(due)),
      ...invoiceTotals(lancamentos, due, closingFor(due), limitOf(id)),
      lancamentos,
    };
    return Response.json(invoiceBody);
  }

  const future = path.match(/^\/api\/v1\/cartoes\/(\d+)\/parcelasFuturas$/);
  if (future) {
    if (!isCreditCard(Number(future[1]))) return Response.json({ message: 'not found' }, { status: 404 });
    // Real API: bare array (no { parcelas } wrapper, no parcelasRestantes).
    const installments: CardFutureResponse = [
      {
        id: 801,
        descricao: 'Notebook',
        valor: -250,
        data: '2026-02-16',
        parcela: '3/6',
        categoria: 10,
        tipo: 'd',
        status: 'nconciliado',
      },
    ];
    return Response.json(installments);
  }

  return null;
}
