import type { CardInvoiceResponse, CardFutureResponse, CloseInvoiceRequest, CloseInvoiceResponse, FirstInvoiceResponse, ReopenInvoiceRequest } from '../../types/index.js';
import { request } from './request.js';

/** The card's first invoice: an object (issue #266), whose vencimento anchors its invoices. */
export async function fetchFirstInvoice(cardId: number): Promise<FirstInvoiceResponse | null> {
  return request<FirstInvoiceResponse | null>('GET', `/v1/cartoes/${cardId}/primeiraFatura?id=${cardId}`);
}

export async function fetchCardInvoice(cardId: number, dueDate: string): Promise<CardInvoiceResponse> {
  return request<CardInvoiceResponse>('GET', `/v1/cartoes/${cardId}/fatura/${dueDate}?id=${cardId}&vencimento=${dueDate}`);
}

export async function fetchCardFuture(cardId: number): Promise<CardFutureResponse> {
  return request<CardFutureResponse>('GET', `/v1/cartoes/${cardId}/parcelasFuturas?id=${cardId}`);
}

/** Closes the card's proximoVencimento invoice, like the web's "Fechar fatura" (POST /cartoes/:id/pagar). */
export async function closeCardInvoice(cardId: number, body: CloseInvoiceRequest): Promise<CloseInvoiceResponse> {
  return request<CloseInvoiceResponse>('POST', `/v1/cartoes/${cardId}/pagar`, body);
}

/** Reopens a closed invoice, like the web's "Reabrir fatura" (POST /cartoes/:id/reabrir). The answer is unused. */
export async function reopenCardInvoice(cardId: number, body: ReopenInvoiceRequest): Promise<unknown> {
  return request<unknown>('POST', `/v1/cartoes/${cardId}/reabrir`, body);
}
