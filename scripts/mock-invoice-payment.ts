// Issue #324, for scripts/mock-api.ts: a Pix that pays a card invoice is a candidate of the import only
// after the invoice closes, like the real API (real use). Fictional ids, names and dates only.
// Cartão Teste Pagamento (207) is paid from Conta Teste Pix (208), linked to connection account 305 in
// mock-connections.ts. Its open invoice (due 2026-03-16) already has its payment scheduled (7001), and the
// candidate search (finalidade 3) leaves that payment out until POST /cartoes/207/pagar closes the invoice.
import type { Account, BankStatementResponse, CardInvoiceEntry, CardInvoiceResponse, Entry } from '../src/types/index.js';
import { calendarDay } from '../src/lib/dates.js';
import { CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT } from '../test/fixtures.js';
import { badRequest, json, readJsonBody, type Body } from './mock-http.js';

const DUE = '2026-03-16';
const NEXT_DUE = '2026-04-16';
const CLOSED_INVOICE_ID = 7100;

export const PIX_ACCOUNT: Account = { ...CHECKING_ACCOUNT, id: 208, nome: 'Conta Teste Pix' };

/** Mutated in place by the close and the reopen: proximoVencimento moves to the next invoice and back. */
export const PAYMENT_CARD: Account = {
  ...CREDIT_CARD_ACCOUNT,
  id: 207,
  nome: 'Cartão Teste Pagamento',
  contada: PIX_ACCOUNT.id,
  proximoVencimento: `${DUE}T00:00:00`,
  proximoFechamento: '2026-03-08T00:00:00',
};

export const PIX_CONNECTION_ACCOUNT = 305;

export const PIX_STATEMENT: BankStatementResponse = {
  inicio: '2026-03-14',
  fim: '2026-03-18',
  saldo: 0,
  lancamentos: [
    { integrationId: 'ffffffff-6666-4000-8000-000000000006', descricao: 'Pix Fatura Cartao', valor: -300, data: DUE, moeda: 1 },
  ],
};

/** The scheduled payment, from the paying account's side. */
const PAYMENT: Entry = {
  id: 7001,
  descricao: 'Pagamento Fatura Cartão Teste Pagamento',
  tipo: 'p',
  valor: -300,
  data: DUE,
  dataPrevista: DUE,
  status: 'agendado',
  conciliado: false,
  conta: PIX_ACCOUNT.id,
  contaT: PAYMENT_CARD.id,
  transferencia: 7002,
};

let closed = false;

/** The payment among the candidates (finalidade 3) once the invoice closed; nothing while it is open. */
export function invoicePaymentCandidates(): Entry[] {
  return closed ? [PAYMENT] : [];
}

/** Card 207's invoice due on `dueDate`, or null for any other card. */
export function paymentCardInvoice(cardId: number, dueDate: string): CardInvoiceResponse | null {
  if (cardId !== PAYMENT_CARD.id) return null;
  if (dueDate !== DUE) return { vencimento: dueDate, fechamento: dueDate, valor: 0, lancamentos: [] };
  const lancamentos: CardInvoiceEntry[] = [
    { id: 7003, descricao: 'Loja Ficticia', valor: -300, data: '2026-03-01', dataCompetencia: '2026-03-01', categoria: 10, tipo: 'd', status: 'nconciliado' },
    { id: 7002, descricao: PAYMENT.descricao, valor: 300, data: DUE, dataCompetencia: DUE, tipo: 'p', status: 'nconciliado', contaT: PIX_ACCOUNT.id },
  ];
  return {
    vencimento: `${DUE}T00:00:00`,
    fechamento: '2026-03-08T00:00:00',
    valor: -300,
    pagamentosAgendados: 300,
    lancamentos,
    ...(closed && { id: CLOSED_INVOICE_ID }),
  };
}

/** A close the web would send for card 207 (mdb.js, PagarFaturaController.ok), or why not. */
function closeRefusal(body: Body): string | null {
  if (closed) return 'invoice already closed';
  if (body.conta !== PAYMENT_CARD.id) return 'conta must be the card';
  if (calendarDay(body.vencimento) !== DUE) return `vencimento must be the open invoice ${DUE}`;
  if (calendarDay(body.data) !== body.data) return 'data must be YYYY-MM-DD';
  if (typeof body.valor !== 'number' || body.valor > 0) return 'valor must be a number, 0 or negative';
  // The payment is already scheduled (pagamentosAgendados): a new one would pay the invoice twice.
  if (body.valor !== 0) return 'valor must be 0: the payment is already scheduled';
  if (typeof body.contaT !== 'string' || body.contaT === '') return 'contaT must be the account id as a string';
  if (typeof body.confirmado !== 'boolean' || typeof body.automatico !== 'boolean') return 'confirmado and automatico must be booleans';
  if (!Array.isArray(body.anexos)) return 'anexos must be an array';
  return null;
}

/** POST /v1/cartoes/207/pagar and /reabrir, or null for any other request. */
export async function invoicePaymentRoute(req: Request, path: string): Promise<Response | null> {
  const match = /^\/api\/v1\/cartoes\/(\d+)\/(pagar|reabrir)$/.exec(path);
  if (req.method !== 'POST' || !match || match[1] !== String(PAYMENT_CARD.id)) return null;
  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  if (match[2] === 'pagar') {
    const refusal = closeRefusal(body);
    if (refusal) return badRequest(refusal);
    closed = true;
    PAYMENT_CARD.proximoVencimento = `${NEXT_DUE}T00:00:00`;
    return json<`POST /v1/cartoes/${number}/pagar`>({ conta: PAYMENT_CARD.id, vencimento: `${DUE}T00:00:00` });
  }
  if (!closed || calendarDay(body.vencimento) !== DUE) return badRequest(`only the invoice due ${DUE} is closed`);
  closed = false;
  PAYMENT_CARD.proximoVencimento = `${DUE}T00:00:00`;
  return json<`POST /v1/cartoes/${number}/reabrir`>({});
}
