import chalk from 'chalk';
import type { EntryStatus } from '../../types/index.js';
import { ENTRY_STATUS_LABELS } from '../../lib/normalize.js';
import { today } from '../../lib/dates.js';

export function formatStatus(status: EntryStatus): string {
  const statusConfig = {
    reconciled: { label: 'Reconciled', color: chalk.green },
    confirmed: { label: 'Confirmed', color: chalk.cyan },
    pending: { label: 'Pending', color: chalk.yellow },
    scheduled: { label: 'Scheduled', color: chalk.blue },
    unknown: { label: 'Unknown', color: chalk.gray },
  };
  const config = statusConfig[status];
  return config.color(config.label);
}

export function formatType(type: 'expense' | 'income' | 'transfer' | 'invoice' | 'payment'): string {
  const typeConfig = {
    expense: { label: 'Expense', color: chalk.red },
    income: { label: 'Income', color: chalk.green },
    transfer: { label: 'Transfer', color: chalk.cyan },
    invoice: { label: 'Invoice', color: chalk.magenta },
    payment: { label: 'Payment', color: chalk.blue },
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
  return chalk.gray(status === undefined ? '(not returned by the API)' : String(status));
}
