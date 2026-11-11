// GET /v1/cartoes/:id/... for scripts/mock-api.ts: invoice, future installments
// and the first invoice date.
import type { CardFutureResponse, CardInvoiceResponse, FirstInvoiceResponse } from '../src/types/index.js';
import { cardInvoice, firstInvoice } from '../test/fixtures.js';
import { roundToCents } from '../src/utils/currency.js';
import { parseId } from '../src/utils/parse.js';
import { invoiceItems } from './mock-card-purchases.js';
import { json, notFound } from './mock-http.js';

const sum = (items: ReadonlyArray<{ valor: number }>): number => roundToCents(items.reduce((total, e) => total + e.valor, 0));

/** Closing date ~8 days before due, matching the unit-test fixtures. */
function closingFor(dueDate: string): string {
  const closing = new Date(`${dueDate}T12:00:00`);
  closing.setDate(closing.getDate() - 8);
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
  lancamentos: ReadonlyArray<{ valor: number; tipo?: string; status?: string }>,
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
      receitas: sum(purchases.filter((e) => e.valor > 0)),
      despesas: sum(purchases.filter((e) => e.valor < 0)),
      ...(limite === undefined ? {} : { disponivel: roundToCents(limite + totalFatura) }),
    },
  };
}

/** The card requests of a mock server, or null for any other request. */
export function cardsRoute(
  req: Request,
  path: string,
  isCreditCard: (id: unknown) => boolean,
  limitOf: (id: number) => number | undefined
): Response | null {
  if (req.method !== 'GET') return null;

  const first = path.match(/^\/api\/v1\/cartoes\/(\d+)\/primeiraFatura$/);
  if (first) {
    const id = parseId(first[1]);
    if (id === undefined || !isCreditCard(id)) return notFound();
    // An object, like the real API (issue #266), not a date string.
    const body: FirstInvoiceResponse = firstInvoice(id, '2026-01-16', closingFor('2026-01-16'));
    return json<`GET /v1/cartoes/${number}/primeiraFatura`>(body);
  }

  const invoice = path.match(/^\/api\/v1\/cartoes\/(\d+)\/fatura\/(\d{4}-\d{2}-\d{2})$/);
  if (invoice) {
    const id = parseId(invoice[1]);
    const due = invoice[2];
    if (id === undefined || !isCreditCard(id)) return notFound();
    const lancamentos = invoiceItems(id, due);
    const invoiceBody: CardInvoiceResponse = {
      ...cardInvoice(due, closingFor(due)),
      ...invoiceTotals(lancamentos, due, closingFor(due), limitOf(id)),
      lancamentos,
    };
    return json<`GET /v1/cartoes/${number}/fatura/${string}`>(invoiceBody);
  }

  const future = path.match(/^\/api\/v1\/cartoes\/(\d+)\/parcelasFuturas$/);
  if (future) {
    if (!isCreditCard(future[1])) return notFound();
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
    return json<`GET /v1/cartoes/${number}/parcelasFuturas`>(installments);
  }

  return null;
}
