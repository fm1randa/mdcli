import type { ptBRBudget as SectionType } from '../pt-BR/budget.js';

/** Budget goals, in English. */
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
  budgetSetDescription: () => 'Set one category goal for a month, or through a later month',
  budgetRemoveDescription: () => 'Remove a category goal (stores 0, and the read drops the row)',
  budgetSetCategoryOption: () => 'Category (id, alias, or name)',
  budgetRemoveCategoryOption: () => 'Category (id, alias, or name) whose goal goes away',
  budgetSetValueOption: () => 'Amount with the sign the read shows: negative expense, positive income. 0 is refused; use budget remove',
  budgetSetMonthOption: () => 'Month YYYY-MM (default: the current month)',
  budgetSetUntilOption: () => 'Repeat the goal from --month through this YYYY-MM, inclusive',
  budgetDryRunOption: () => 'Show the write without saving. Only reads the API and does not ask for confirmation',
  errorBudgetZero: () => 'A goal of 0 removes it. Use: mdcli budget remove',
  errorBudgetUntilBefore: (until, month) => `--until ${until} is before ${month}.`,
  errorBudgetSpanTooLong: () => 'A goal covers at most 600 months.',
  errorBudgetTransfer: (name) => `Category "${name}" is a transfer. A goal is for an expense or an income category.`,
  errorBudgetParentSum: (name, min, month) =>
    `Category ${name} in ${month} must be at least the sum of its children (minimum ${min}).`,
  errorBudgetJsonNeedsSkip: () => '--json does not prompt. Use --dry-run or --dangerously-skip-confirmation.',
  confirmBudgetSet: (name, id, amount, months) =>
    `Set the goal of "${name}" (${id}) to ${amount} for ${months}? (y/N) `,
  confirmBudgetRemove: (name, id, months) =>
    `Remove the goal of "${name}" (${id}) for ${months}? (y/N) `,
  budgetWriteCancelled: () => 'Write cancelled.',
  budgetDryRunSet: (name, id, amount, months) =>
    `Would set the goal of "${name}" (${id}) to ${amount} for ${months}.`,
  budgetDryRunRemove: (name, id, months) =>
    `Would remove the goal of "${name}" (${id}) for ${months}.`,
  budgetSetDone: (name, id, amount, months) =>
    `Goal of "${name}" (${id}) set to ${amount} for ${months}.`,
  budgetRemoveDone: (name, id, months) =>
    `Goal of "${name}" (${id}) removed for ${months}.`,
};
