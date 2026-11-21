import { describe, expect, test } from 'bun:test';
import { MAX_GOAL_MONTHS, monthSpan } from '../src/lib/budget-write.js';
import { enBudget } from '../src/lib/i18n/catalog/en/budget.js';
import { ptBRBudget } from '../src/lib/i18n/catalog/pt-BR/budget.js';

describe('monthSpan', () => {
  test('lists every month of the span across a year turn', () => {
    expect(monthSpan('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('stops at the ceiling instead of truncating', () => {
    expect(monthSpan('2000-01', '2049-12')).toHaveLength(600);
    expect(monthSpan('2000-01', '2050-01')).toBeUndefined();
  });
});

describe('errorBudgetSpanTooLong', () => {
  test('names the ceiling it is given, in both catalogs', () => {
    expect(ptBRBudget.errorBudgetSpanTooLong(MAX_GOAL_MONTHS)).toBe('Uma meta cobre no máximo 600 meses.');
    expect(enBudget.errorBudgetSpanTooLong(MAX_GOAL_MONTHS)).toBe('A goal covers at most 600 months.');
    expect(ptBRBudget.errorBudgetSpanTooLong(12)).toBe('Uma meta cobre no máximo 12 meses.');
    expect(enBudget.errorBudgetSpanTooLong(12)).toBe('A goal covers at most 12 months.');
  });
});
