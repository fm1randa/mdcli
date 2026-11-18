import type { BudgetGoalSave } from '../types/budget.js';
import type { BudgetReport, CategoryRef, KindBudget } from './budget.js';
import { roundToCents } from '../utils/currency.js';
import { parseInteger } from '../utils/parse.js';
import { t } from './i18n/index.js';

/** The parent-sum tolerance the web uses before it posts (mdb.js, 2026-10-30). */
const BUDGET_PARENT_TOLERANCE = 0.001;

/** A category that can hold a goal. Transfers are refused before this exists. */
export interface GoalCategory {
  readonly id: number;
  readonly name: string;
  readonly tipo: 'd' | 'r';
}

/**
 * One write. `value` is sent as `meta` with the sign the user typed: expenses
 * are negative and income is positive on the read, and the web copies the
 * editor value the same way. `0` removes the goal (`loadBudget` drops it).
 */
export interface GoalWrite {
  readonly category: GoalCategory;
  readonly value: number;
  /** `YYYY-MM`, ascending, at least one. */
  readonly months: readonly string[];
}

/** A parent that would sit below the sum of its children. */
export interface BudgetConflict {
  readonly category: CategoryRef;
  readonly value: number;
  /** Absolute sum of the children's goals. The parent must reach this. */
  readonly minAbs: number;
}

type CategoryLine = KindBudget['categories'][number];

const KIND_OF = { d: 'expense', r: 'income' } as const;

/** Inclusive ceiling. A longer range used to be cut here and still saved. */
const MAX_GOAL_MONTHS = 600;

/**
 * Inclusive `YYYY-MM` list. The caller has already rejected an inverted range.
 * Undefined when the range is longer than {@link MAX_GOAL_MONTHS}.
 */
export function monthSpan(start: string, until?: string): readonly [string, ...string[]] | undefined {
  if (until === undefined) return [start];
  const months: [string, ...string[]] = [start];
  let cursor = nextMonth(start);
  while (cursor <= until) {
    if (months.length >= MAX_GOAL_MONTHS) return undefined;
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

function nextMonth(month: string): string {
  const year = parseInteger(month.slice(0, 4)) ?? 0;
  const mon = parseInteger(month.slice(5, 7)) ?? 1;
  if (mon === 12) return `${year + 1}-01`;
  return `${year}-${String(mon + 1).padStart(2, '0')}`;
}

/** The observed POST body. `sobreescrever` stays false: this command does not repeat over later months. */
export function buildSavePayload(write: GoalWrite): BudgetGoalSave {
  return {
    metas: [{
      meta: write.value,
      categoria: write.category.id,
      tipo: write.category.tipo,
      datas: write.months.map((month) => `${month}-01`),
      sobreescrever: false,
    }],
  };
}

/**
 * Parents the write would leave below their children, for one month's report.
 * The command runs this for every month it would save. A parent whose goal is
 * 0 is skipped: the web does that (`if (!b.filhos || !s.metasMes[b.id]) return
 * true`, mdb.js ~54391), so removing a parent is allowed while its children remain.
 */
export function findConflicts(report: BudgetReport, write: GoalWrite): BudgetConflict[] {
  const section = report.budgets[KIND_OF[write.category.tipo]];
  if (!section) return [];
  return section.categories.flatMap((line) => {
    const conflict = conflictOn(line, write);
    return conflict ? [conflict] : [];
  });
}

function conflictOn(line: CategoryLine, write: GoalWrite): BudgetConflict | null {
  const targetsParent = line.category.id === write.category.id;
  const targetsChild = line.subcategories.some((child) => child.category.id === write.category.id);
  if (!targetsParent && !targetsChild) return null;
  const parentValue = targetsParent ? write.value : (line.figures?.goal ?? 0);
  if (parentValue === 0) return null;
  const minAbs = childSum(line, write);
  if (Math.abs(parentValue) + BUDGET_PARENT_TOLERANCE >= minAbs) return null;
  return { category: line.category, value: parentValue, minAbs };
}

function childSum(line: CategoryLine, write: GoalWrite): number {
  return line.subcategories.reduce((sum, child) => {
    const value = child.category.id === write.category.id ? write.value : child.figures.goal;
    return roundToCents(sum + Math.abs(value));
  }, 0);
}

export function formatConflicts(conflicts: readonly BudgetConflict[], month: string): string {
  return conflicts.map((conflict) => {
    const name = conflict.category.name ?? String(conflict.category.id);
    return t('errorBudgetParentSum', name, conflict.minAbs, month);
  }).join('\n');
}

/**
 * The `conflitos` of a 422 body, each entry as text. Field names on that
 * contract were not in the bundle, so an object is its JSON, not a parsed shape.
 * Null when the body has no such array: the caller keeps the raw API error.
 */
export function renderConflicts(body: unknown): string[] | null {
  if (!body || typeof body !== 'object' || !('conflitos' in body)) return null;
  const conflitos = (body as { conflitos?: unknown }).conflitos;
  if (!Array.isArray(conflitos) || conflitos.length === 0) return null;
  return conflitos.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)));
}
