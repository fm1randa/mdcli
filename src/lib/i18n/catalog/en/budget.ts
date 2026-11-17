import type { ptBRBudget as SectionType } from '../pt-BR/budget.js';

/** Read-only budget goals, in English. */
export const enBudget: typeof SectionType = {
  budgetDescription: () => 'Budget goals for the period: goal, actual, remaining and surplus',
  budgetMonthOption: () => 'Month YYYY-MM (default: the current month). Not with --from/--to',
  budgetFromOption: () => 'Start YYYY-MM-DD. Alone, the end is the last day of the current month',
  budgetToOption: () => 'End YYYY-MM-DD. Alone, the start is the first day of the current month',
  budgetRegimeOption: () => 'cash (default) or accrual',
  budgetRegimeCash: () => 'cash',
  budgetRegimeAccrual: () => 'accrual',
  budgetHeader: (from, to, regime) => `Budget ${from} → ${to} (${regime})`,
  budgetKindExpense: () => 'Expenses',
  budgetKindIncome: () => 'Income',
  budgetKindInvestment: () => 'Investments',
  budgetGeneral: () => 'General goal',
  budgetTotal: (kind) => `${kind} total`,
  budgetGoal: () => 'Goal',
  budgetConfirmed: () => 'Confirmed',
  budgetProjected: () => 'Projected',
  budgetRemaining: () => 'Remaining',
  budgetSurplus: () => 'Surplus',
  budgetUnknownCategory: (id) => `Category ${id} (not found)`,
  errorBudgetPeriodConflict: () => '--month cannot be combined with --from or --to.',
  errorInvalidBudgetMonth: (value) => `Invalid month "${value}". Use YYYY-MM.`,
  errorBudgetRangeReversed: (from, to) => `--from ${from} is after --to ${to}.`,
  errorInvalidRegime: (value) => `Invalid regime "${value}". Use cash or accrual.`,
};
