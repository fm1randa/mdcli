// A card whose invoice already closed (issue #281), for scripts/mock-api.ts. Fictional ids and dates only.
// Cartão Teste Fechado (206) is linked to connection account 304 in mock-connections.ts. Its
// proximoVencimento is already the March invoice, while the statement's purchases are in February's,
// which closed on 2026-02-08 (mock-cards.ts closes an invoice 8 days before its due date).
import type { Account, BankStatementResponse, CardInvoiceEntry } from '../src/types/index.js';
import { CREDIT_CARD_ACCOUNT } from '../test/fixtures.js';

export const CLOSED_INVOICE_CARD: Account = {
  ...CREDIT_CARD_ACCOUNT,
  id: 206,
  nome: 'Cartão Teste Fechado',
  proximoVencimento: '2026-03-16T00:00:00',
  proximoFechamento: '2026-03-08T00:00:00',
};

export const CLOSED_INVOICE_CONNECTION_ACCOUNT = 304;

const IMPORTED = 'dddddddd-4444-4000-8000-000000000004';
const RECONCILED = 'eeeeeeee-5555-4000-8000-000000000005';

export const CLOSED_INVOICE_STATEMENT: BankStatementResponse = {
  inicio: '2026-02-01',
  fim: '2026-02-10',
  saldo: 0,
  lancamentos: [
    { integrationId: IMPORTED, descricao: 'Livraria Ficticia', valor: -20, data: '2026-02-02', moeda: 1 },
    { integrationId: RECONCILED, descricao: 'Farmacia Ficticia', valor: -45, data: '2026-02-07', moeda: 1 },
  ],
};

/** The items of card 206's invoice due on `dueDate`, or null for any other card. */
export function closedInvoiceItems(cardId: number, dueDate: string): CardInvoiceEntry[] | null {
  if (cardId !== CLOSED_INVOICE_CARD.id) return null;
  if (dueDate === '2026-02-16') {
    return [
      // Imported from IMPORTED, with a competence date the bank's date does not match.
      {
        id: 6001, descricao: 'Livraria Importada', valor: -20, data: '2026-01-30', dataCompetencia: '2026-01-30',
        categoria: 10, tipo: 'd', status: 'conciliado', integrationId: IMPORTED,
      },
      // Reconciled with RECONCILED on its own day.
      {
        id: 6002, descricao: 'Farmacia Conciliada', valor: -45, data: '2026-02-07', dataCompetencia: '2026-02-07',
        categoria: 10, tipo: 'd', status: 'conciliado',
      },
    ];
  }
  if (dueDate === '2026-03-16') {
    // Another purchase of the same value, two days after RECONCILED.
    return [
      {
        id: 6003, descricao: 'Outra Farmacia', valor: -45, data: '2026-02-09', dataCompetencia: '2026-02-09',
        categoria: 10, tipo: 'd', status: 'nconciliado',
      },
    ];
  }
  return [];
}
