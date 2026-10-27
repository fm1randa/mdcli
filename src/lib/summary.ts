import { roundToCents } from '../utils/currency.js';
import { t } from './i18n/index.js';
import type { NormalizedEntry } from '../types/index.js';

interface SummaryRow {
  key: string;
  label: string;
  count: number;
  income: number;
  expenses: number;
  net: number;
}

/**
 * Groups entries and totals them. Values are signed (expenses negative), so
 * income sums the positive values and expenses the negative ones.
 */
export function summarize(
  entries: NormalizedEntry[],
  groupOf: (entry: NormalizedEntry) => { key: string; label: string }
): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();

  for (const entry of entries) {
    const { key, label } = groupOf(entry);
    const row = groups.get(key) ?? { key, label, count: 0, income: 0, expenses: 0, net: 0 };
    row.count += 1;
    if (entry.value >= 0) {
      row.income += entry.value;
    } else {
      row.expenses += entry.value;
    }
    groups.set(key, row);
  }

  return [...groups.values()].map((row) => ({
    ...row,
    income: roundToCents(row.income),
    expenses: roundToCents(row.expenses),
    net: roundToCents(row.income + row.expenses),
  }));
}

export function totalRow(rows: SummaryRow[]): SummaryRow {
  return rows.reduce(
    (total, row) => ({
      ...total,
      count: total.count + row.count,
      income: roundToCents(total.income + row.income),
      expenses: roundToCents(total.expenses + row.expenses),
      net: roundToCents(total.net + row.net),
    }),
    { key: 'total', label: t('labelTotal'), count: 0, income: 0, expenses: 0, net: 0 }
  );
}
