import type { BudgetGoalRow, Category } from '../src/types/index.js';
import { category } from './fixtures.js';

/** Categories the budget rows name that the shared catalog does not already have. */
export const BUDGET_EXTRA_CATEGORIES: Category[] = [
  category(12, 'Zebra', 'd'),
  category(13, 'Filhote', 'd', { pai: 12 }),
  category(14, 'Aves', 'd', { pai: 10 }),
];

function goal(tipo: string, meta: number | null, extra: Partial<BudgetGoalRow> = {}): BudgetGoalRow {
  return {
    meta,
    residuo: 0,
    confirmado: 0,
    projetado: 0,
    realizarc: 0,
    realizarp: 0,
    excedentec: 0,
    excedentep: 0,
    tipo,
    ...extra,
  };
}

/**
 * `investimentos=false`, the expense and income load. Remaining and surplus on
 * each row are the API's, and they do not add up to the section total, so a
 * test can tell a summed gap from one recomputed off the amounts. The `i` row
 * is poison: investment numbers must come from the other response.
 */
export const SPEND_ROWS: BudgetGoalRow[] = [
  goal('d', -3000, { confirmado: -1200, projetado: -1500, realizarc: 1800, realizarp: 1500 }),
  goal('d', -800, { categoria: 10, confirmado: -80, projetado: -200, realizarc: 1, realizarp: 2 }),
  goal('d', -200, { categoria: 11, categoriaPai: 10, confirmado: -50, projetado: -50, realizarc: 7, realizarp: 8 }),
  goal('d', -100, { categoria: 14, categoriaPai: 10, confirmado: -10, projetado: -10, realizarc: 6, realizarp: 6 }),
  goal('d', -100, { categoria: 40, confirmado: -90, projetado: -100, realizarc: 3, realizarp: 4 }),
  goal('d', 0, { categoria: 12, confirmado: -1, projetado: -1, realizarc: 1, realizarp: 1 }),
  goal('d', -40, { categoria: 13, categoriaPai: 12, confirmado: -10, projetado: -10, realizarc: 9, realizarp: 9 }),
  goal('d', 0, { categoria: 30, confirmado: -5, projetado: -5, realizarc: 5, realizarp: 5 }),
  goal('x', -123, { categoria: 99, confirmado: -1, projetado: -1, realizarc: 1, realizarp: 1 }),
  goal('i', -7777, { categoria: 88, confirmado: -1, projetado: -1, realizarc: 1, realizarp: 1 }),
  goal('r', 5000, { confirmado: 2000, projetado: 2500, realizarc: 3000, realizarp: 2500 }),
  goal('r', 4000, { categoria: 20, confirmado: 2000, projetado: 2200, realizarc: 5, realizarp: 6 }),
];

/**
 * `investimentos=true`. The `d` and `r` rows are poison, so a client that
 * paints expenses from this response shows Outros at -9999. Category 77 is
 * not in the catalog. Its remaining is 1, not the 40 the section total recomputes.
 */
export const INVEST_ROWS: BudgetGoalRow[] = [
  goal('d', -9999, { categoria: 40, confirmado: -1, projetado: -1, realizarc: 1, realizarp: 1 }),
  goal('r', 8888, { categoria: 20, confirmado: 1, projetado: 1, realizarc: 1, realizarp: 1 }),
  goal('i', -200, { confirmado: -20, projetado: -40, realizarc: 180, realizarp: 160 }),
  goal('i', -50, { categoria: 77, confirmado: -10, projetado: -15, realizarc: 1, realizarp: 99 }),
];
