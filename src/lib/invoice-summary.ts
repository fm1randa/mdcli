import type { Account, CardInvoiceResponse, NormalizedInvoiceSummary } from '../types/index.js';

const amount = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const day = (value: string | undefined): string | null => (value ? value.slice(0, 10) : null);

/**
 * The summary the web shows beside the invoice items, from resumo (field names
 * from md.js, resumo.setParams). Both the text summary and --json --summary
 * read it, so they cannot disagree.
 */
export function normalizeInvoiceSummary(invoice: CardInvoiceResponse, account: Account): NormalizedInvoiceSummary {
  const resumo = invoice.resumo ?? {};
  return {
    id: invoice.id ?? null,
    closed: invoice.id !== undefined,
    dueDate: day(resumo.vencimento ?? invoice.vencimento),
    closingDate: day(resumo.fechamento ?? invoice.fechamento),
    previousInvoice: amount(resumo.valorFaturaAnterior),
    paid: amount(resumo.pagamentosConf),
    scheduledPayments: amount(resumo.pagamentosAgen),
    expenses: amount(resumo.despesas),
    income: amount(resumo.receitas),
    total: amount(resumo.totalFatura ?? invoice.valor),
    toPay: amount(resumo.totalPagar),
    reconciled: amount(resumo.conciliado),
    unreconciled: amount(resumo.nconciliado),
    limit: amount(account.limite),
    available: amount(resumo.disponivel),
  };
}
