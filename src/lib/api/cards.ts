import type { CardInvoiceResponse, CardFutureResponse, FirstInvoiceResponse } from '../../types/index.js';
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
