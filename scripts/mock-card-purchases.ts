// Card purchases for scripts/mock-api.ts: the ones POST /v1/lancamentos
// creates and the invoice items of GET /v1/cartoes/:id/fatura.
import type { CardInvoiceEntry, CreateEntryResponse } from '../src/types/index.js';
import { type Body, numberArray, numberOrNull, requiredId, requiredNumber } from './mock-http.js';
import { createdEntry, mockEntryId, mockOccurrenceId } from './mock-entry-payload.js';
import { SEEDED_ENTRIES } from './mock-entry-seed.js';

interface StoredCardPurchase {
  id: number;
  conta: number;
  descricao: string;
  valor: number;
  data: string;
  dataPrevista: string;
  categoria: number | null;
}

// Card purchases created through POST, as the real API keeps them: the POST
// answers an occurrence ID ("<series>A<purchase date>", Real use 2026-10-16)
// and the entry ID only shows up in the invoice, which lists the purchase
// with just its basic fields. GET/PUT /v1/lancamentos/:id take the entry ID.
let nextCardEntryId = 9101;
const cardPurchases: StoredCardPurchase[] = [];

/** Stores a card purchase and returns the POST answer for it. */
export function createCardPurchase(body: Body): CreateEntryResponse {
  const id = nextCardEntryId++;
  const parcelas = body.parcelas as { valor: number }[] | undefined;
  const valor = parcelas ? parcelas[0].valor : requiredNumber(body.valor, 'valor');
  // A purchase has no effective date but is not pending: it sits on the invoice.
  const { dataEfetiva: _effective, ...purchase } = createdEntry(body, mockEntryId(id));
  SEEDED_ENTRIES[id] = { ...purchase, status: 'confirmado', valor, lembrete: 0, tags: numberArray(body.tags), observacoes: String(body.observacoes ?? '') };
  cardPurchases.push({
    id,
    conta: requiredId(body.conta, 'conta'),
    descricao: String(body.descricao),
    valor,
    data: String(body.dataCompetencia),
    dataPrevista: String(body.dataPrevista),
    categoria: numberOrNull(body.categoria),
  });
  return { ...createdEntry(body, mockOccurrenceId(`1234567A${String(body.dataCompetencia)}`)), status: 'confirmado' };
}

/** The invoice items of a card's invoice due on dueDate. */
export function invoiceItems(cardId: number, dueDate: string): CardInvoiceEntry[] {
  // January 2026 invoice: one purchase and the previous invoice's payment
  // (tipo p). Bill total is -87.5; summing the items would yield +12.5.
  const seeded: CardInvoiceEntry[] = dueDate.startsWith('2026-01-')
    ? [
        {
          id: 1,
          descricao: 'Mercado',
          valor: -87.5,
          data: '2026-01-05',
          categoria: 11,
          tipo: 'd',
          status: 'nconciliado',
        },
        {
          id: 2,
          descricao: 'Pagamento cartão',
          valor: 100,
          data: '2025-12-16',
          categoria: 30,
          tipo: 'p',
          status: 'conciliado',
          contaT: 201,
        },
      ]
    : dueDate === '2026-11-16'
      ? [
          // Installment 12/18 of a purchase made a year earlier: data is the
          // purchase date, the due date only comes from the invoice.
          {
            id: 123456,
            descricao: 'Item Parcelado',
            valor: -123.45,
            data: '2025-11-19',
            categoria: 11,
            parcela: '12/18',
            tipo: 'd',
            status: 'nconciliado',
          },
        ]
      : [];
  const created = cardPurchases
    .filter((p) => p.conta === cardId && p.dataPrevista === dueDate)
    .map(({ conta: _conta, dataPrevista: _due, ...item }): CardInvoiceEntry => ({ ...item, tipo: 'd', status: 'nconciliado' }));
  return [...seeded, ...created];
}
