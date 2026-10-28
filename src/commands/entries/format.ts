import chalk from 'chalk';
import type { EntryStatus } from '../../types/index.js';
import { ENTRY_STATUS_LABELS } from '../../lib/normalize.js';
import { today } from '../../lib/dates.js';
import { t } from '../../lib/i18n/index.js';

export function formatStatus(status: EntryStatus): string {
  const statusConfig = {
    reconciled: { label: t('statusReconciled'), color: chalk.green },
    confirmed: { label: t('statusConfirmed'), color: chalk.cyan },
    pending: { label: t('statusPending'), color: chalk.yellow },
    scheduled: { label: t('statusScheduled'), color: chalk.blue },
    unknown: { label: t('statusUnknown'), color: chalk.gray },
  };
  const config = statusConfig[status];
  return config.color(config.label);
}

export function formatType(type: 'expense' | 'income' | 'transfer' | 'invoice' | 'payment'): string {
  const typeConfig = {
    expense: { label: t('typeExpense'), color: chalk.red },
    income: { label: t('typeIncome'), color: chalk.green },
    transfer: { label: t('typeTransfer'), color: chalk.cyan },
    invoice: { label: t('typeInvoice'), color: chalk.magenta },
    payment: { label: t('typePayment'), color: chalk.blue },
  };
  const config = typeConfig[type];
  return config.color(config.label);
}

/**
 * The status the API answered with - never assumed from what we sent. It is
 * a label (conciliado, pendente...) or, on some answers, the status object
 * itself ({ confirmado, conciliado }).
 */
export function describeStatus(status: unknown, plannedDate?: unknown): string {
  if (typeof status === 'string' && ENTRY_STATUS_LABELS[status]) {
    return formatStatus(ENTRY_STATUS_LABELS[status]);
  }
  if (status !== null && typeof status === 'object' && 'confirmado' in status) {
    const { confirmado, conciliado } = status as { confirmado?: boolean; conciliado?: boolean };
    if (conciliado) return formatStatus('reconciled');
    if (confirmado) return formatStatus('confirmed');
    // Unconfirmed is pendente up to today and agendado after it.
    const date = typeof plannedDate === 'string' ? plannedDate.slice(0, 10) : undefined;
    return formatStatus(date !== undefined && date > today() ? 'scheduled' : 'pending');
  }
  return chalk.gray(status === undefined ? t('notReturnedByApi') : String(status));
}
