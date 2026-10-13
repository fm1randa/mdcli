import { describe, expect, test } from 'bun:test';
import { summarize, totalRow } from '../src/lib/summary.js';
import type { NormalizedEntry } from '../src/types/index.js';

function entry(partial: Partial<NormalizedEntry> & Pick<NormalizedEntry, 'id' | 'value'>): NormalizedEntry {
  return {
    description: `Entry ${partial.id}`,
    date: '2026-01-01',
    type: partial.value >= 0 ? 'income' : 'expense',
    status: 'reconciled',
    accountId: 1,
    categoryId: 10,
    installment: null,
    ...partial,
  };
}

const byCategory = (e: NormalizedEntry) => ({
  key: String(e.categoryId),
  label: e.categoryId === 10 ? 'Food' : 'Other',
});

describe('summarize', () => {
  test('groups income and expenses separately and rounds to cents', () => {
    const rows = summarize(
      [
        entry({ id: 1, value: 100.105, categoryId: 10 }),
        entry({ id: 2, value: -40.101, categoryId: 10 }),
        entry({ id: 3, value: -10, categoryId: 20 }),
      ],
      byCategory
    );

    // income/expenses are rounded on their own; net rounds the raw sum (100.105 - 40.101)
    expect(rows).toEqual([
      { key: '10', label: 'Food', count: 2, income: 100.11, expenses: -40.1, net: 60 },
      { key: '20', label: 'Other', count: 1, income: 0, expenses: -10, net: -10 },
    ]);
  });

  test('returns an empty list for no entries', () => {
    expect(summarize([], byCategory)).toEqual([]);
  });
});

describe('totalRow', () => {
  test('sums every column and keeps the Total label', () => {
    const rows = summarize(
      [entry({ id: 1, value: 50, categoryId: 10 }), entry({ id: 2, value: -20, categoryId: 20 })],
      byCategory
    );

    expect(totalRow(rows)).toEqual({
      key: 'total',
      label: 'Total',
      count: 2,
      income: 50,
      expenses: -20,
      net: 30,
    });
  });
});
