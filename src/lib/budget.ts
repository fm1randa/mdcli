import { apiGet, fetchCategories, loadSessionPreferences } from './api.js';
import { setEntriesPreferences, type EntriesPreferences } from './entries-preferences.js';
import { regimeCode, type Regime } from './regime.js';
import type { DateRange } from './dates.js';
import type { BudgetGoalRow, BudgetKindCode } from '../types/budget.js';
import type { Category } from '../types/category.js';
import { roundToCents } from '../utils/currency.js';

/** The kinds in report order, with their API code. Every map derives from this list. */
const BUDGET_KINDS = [
  ['expense', 'd'],
  ['income', 'r'],
  ['investment', 'i'],
] as const satisfies ReadonlyArray<readonly [string, BudgetKindCode]>;

export type BudgetKind = (typeof BUDGET_KINDS)[number][0];

/** What the caller asks for. The command builds it from flags. This module trusts it. */
export interface BudgetQuery {
  readonly period: DateRange;
  readonly regime: Regime;
}

/**
 * Spending measured against a goal on one basis. When the goal is missed,
 * surplus keeps the web's negative sign and remaining is 0.
 */
interface Progress {
  readonly amount: number;
  readonly remaining: number;
  readonly surplus: number;
}

/** A goal and its progress on confirmed entries, and on confirmed plus pending. */
export interface GoalFigures {
  readonly goal: number;
  readonly confirmed: Progress;
  readonly projected: Progress;
}

/** A category as the catalog names it. `name` null means the id is not in the catalog. */
export interface CategoryRef {
  readonly id: number;
  /** nomeRel (the leaf name), else nome. */
  readonly name: string | null;
}

/** A subcategory goal. No `subcategories` field, so a child cannot carry children. */
interface SubcategoryGoal {
  readonly category: CategoryRef;
  readonly figures: GoalFigures;
}

/**
 * A top-level category. `figures` null means the parent's own goal was dropped
 * (meta 0) and the line exists only because a subcategory has one.
 */
type CategoryGoal =
  | { readonly category: CategoryRef; readonly figures: GoalFigures; readonly subcategories: readonly SubcategoryGoal[] }
  | { readonly category: CategoryRef; readonly figures: null; readonly subcategories: readonly [SubcategoryGoal, ...SubcategoryGoal[]] };

/**
 * One kind. `general` is the API row with no category. `total` is the web's
 * sum of category lines that have their own goal, with remaining and surplus
 * recomputed. A general line cannot hold categories.
 */
export interface KindBudget {
  readonly general: GoalFigures | null;
  readonly categories: readonly CategoryGoal[];
  readonly total: GoalFigures;
}

/** The report `--json` prints. A kind is absent when no row of it has a goal. */
export interface BudgetReport {
  readonly period: DateRange;
  readonly regime: Regime;
  readonly budgets: { readonly [K in BudgetKind]?: KindBudget };
}

const BUDGET_PATH = '/v2/lancamentos/metasorcamento';

/**
 * Reads budget goals the way the Orçamento screen does, plus investment rows.
 * Expense and income come from `investimentos=false`, the screen's request.
 * Investment comes from a second GET, and only its `i` rows are kept, so a
 * server that recounts expenses when the flag is on cannot change those numbers.
 */
export async function loadBudget(query: BudgetQuery): Promise<BudgetReport> {
  const [preferences, catalog] = await Promise.all([
    loadSessionPreferences(),
    fetchCategories(),
  ]);
  const [spendRows, investRows] = await Promise.all([
    apiGet<BudgetGoalRow[]>(budgetEndpoint(query, preferences, false)),
    apiGet<BudgetGoalRow[]>(budgetEndpoint(query, preferences, true)),
  ]);
  const rows = [
    ...spendRows.filter((row) => row.tipo !== 'i'),
    ...investRows.filter((row) => row.tipo === 'i'),
  ];
  return { period: query.period, regime: query.regime, budgets: assemble(rows, namesOf(catalog.items)) };
}

function budgetEndpoint(query: BudgetQuery, preferences: EntriesPreferences, investments: boolean): string {
  const params = new URLSearchParams({
    inicio: query.period.start,
    fim: query.period.end,
    regime: regimeCode(query.regime),
    tipo: 'categoria',
    indefinidas: 'false',
    investimentos: String(investments),
  });
  setEntriesPreferences(params, preferences);
  return `${BUDGET_PATH}?${params.toString()}`;
}

type NameOf = (id: number) => string | null;

function namesOf(items: readonly Category[]): NameOf {
  const names = new Map(items.map((item) => [item.id, item.nomeRel || item.nome]));
  return (id) => names.get(id) ?? null;
}

function categoryRef(id: number, nameOf: NameOf): CategoryRef {
  return { id, name: nameOf(id) };
}

function assemble(rows: readonly BudgetGoalRow[], nameOf: NameOf): BudgetReport['budgets'] {
  const kept = rows.filter((row) => row.meta);
  const budgets: { [K in BudgetKind]?: KindBudget } = {};
  for (const [kind, code] of BUDGET_KINDS) {
    const own = kept.filter((row) => row.tipo === code);
    const generalRow = own.find((row) => row.categoria === undefined || row.categoria === null);
    const general = generalRow ? figuresOf(generalRow) : null;
    const parents = new Map<number, BudgetGoalRow>();
    const children = new Map<number, BudgetGoalRow[]>();
    for (const row of own) {
      if (row.categoria == null) continue;
      const parentId = row.categoriaPai;
      if (parentId === undefined || parentId === null) {
        parents.set(row.categoria, row);
      } else {
        const list = children.get(parentId) ?? [];
        list.push(row);
        children.set(parentId, list);
      }
    }
    const lines: CategoryGoal[] = [];
    for (const id of new Set([...parents.keys(), ...children.keys()])) {
      const subs = sortLines((children.get(id) ?? []).flatMap((row) => {
        if (row.categoria == null) return [];
        return [{ category: categoryRef(row.categoria, nameOf), figures: figuresOf(row) }];
      }));
      const parent = parents.get(id);
      if (!parent) {
        const [first, ...rest] = subs;
        if (!first) continue;
        lines.push({ category: categoryRef(id, nameOf), figures: null, subcategories: [first, ...rest] });
      } else {
        lines.push({ category: categoryRef(id, nameOf), figures: figuresOf(parent), subcategories: subs });
      }
    }
    const categories = sortLines(lines);
    if (general === null && categories.length === 0) continue;
    const withGoal = categories.flatMap((line) => (line.figures ? [{ figures: line.figures }] : []));
    budgets[kind] = { general, categories, total: sumFigures(withGoal) };
  }
  return budgets;
}

function figuresOf(row: BudgetGoalRow): GoalFigures {
  return {
    goal: row.meta ?? 0,
    confirmed: { amount: row.confirmado, remaining: row.realizarc, surplus: row.excedentec },
    projected: { amount: row.projetado, remaining: row.realizarp, surplus: row.excedentep },
  };
}

function progressFromGap(amount: number, goal: number): Progress {
  const gap = roundToCents(Math.abs(goal) - Math.abs(amount));
  return gap > 0
    ? { amount, remaining: gap, surplus: 0 }
    : { amount, remaining: 0, surplus: gap };
}

function sumFigures(lines: ReadonlyArray<{ figures: GoalFigures }>): GoalFigures {
  let goal = 0;
  let confirmed = 0;
  let projected = 0;
  for (const line of lines) {
    goal = roundToCents(goal + line.figures.goal);
    confirmed = roundToCents(confirmed + line.figures.confirmed.amount);
    projected = roundToCents(projected + line.figures.projected.amount);
  }
  return { goal, confirmed: progressFromGap(confirmed, goal), projected: progressFromGap(projected, goal) };
}

function sortLines<L extends { category: CategoryRef; figures: GoalFigures | null }>(lines: readonly L[]): L[] {
  return [...lines].sort((left, right) => {
    const byRatio = ratio(right) - ratio(left);
    if (byRatio !== 0) return byRatio;
    if (left.category.name === null || right.category.name === null) {
      if (left.category.name === right.category.name) return left.category.id - right.category.id;
      return left.category.name === null ? 1 : -1;
    }
    const byName = left.category.name.localeCompare(right.category.name, 'pt-BR');
    return byName !== 0 ? byName : left.category.id - right.category.id;
  });
}

function ratio(line: { figures: GoalFigures | null }): number {
  if (!line.figures || line.figures.goal === 0) return 0;
  return Math.abs(line.figures.confirmed.amount / line.figures.goal);
}
