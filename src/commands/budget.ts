import { Command } from 'commander';
import { action, exitWithError } from '../utils/action.js';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';
import { newTable } from '../utils/table.js';
import { t } from '../lib/i18n/index.js';
import { monthRange, today, type DateRange } from '../lib/dates.js';
import { parsePeriodOptions, type PeriodOptions } from './period-options.js';
import { loadBudget, type BudgetKind, type BudgetReport, type CategoryRef, type GoalFigures, type KindBudget } from '../lib/budget.js';
import { registerBudgetWrites } from './budget-write.js';
import { parseRegime, type Regime } from '../lib/regime.js';

interface BudgetOptions extends PeriodOptions {
  regime?: string;
  json?: boolean;
}

const KIND_LABEL: Record<BudgetKind, () => string> = {
  expense: () => t('budgetKindExpense'),
  income: () => t('budgetKindIncome'),
  investment: () => t('budgetKindInvestment'),
};

function kindLabel(kind: BudgetKind): string {
  return KIND_LABEL[kind]();
}

function parseBudgetOptions(options: BudgetOptions): { period: DateRange; regime: Regime } {
  const regime = options.regime === undefined ? 'cash' : parseRegime(options.regime);
  if (regime === null) exitWithError(t('errorInvalidRegime', options.regime ?? ''));
  return { period: parsePeriodOptions(options, monthRange(today().slice(0, 7))), regime };
}

function money(figures: GoalFigures | null): string[] {
  if (!figures) return ['—', '—', '—', '—', '—'];
  return [
    formatCurrency(figures.goal),
    formatCurrency(figures.confirmed.amount),
    formatCurrency(figures.projected.amount),
    formatCurrency(figures.confirmed.remaining),
    formatCurrency(figures.confirmed.surplus),
  ];
}

function categoryLabel(category: CategoryRef): string {
  return category.name ?? t('budgetUnknownCategory', category.id);
}

function pushKind(table: ReturnType<typeof newTable>, kindName: string, kind: KindBudget): void {
  if (kind.general) table.push([t('budgetGeneral'), ...money(kind.general)]);
  for (const line of kind.categories) {
    table.push([categoryLabel(line.category), ...money(line.figures)]);
    for (const child of line.subcategories) {
      table.push([`  ${categoryLabel(child.category)}`, ...money(child.figures)]);
    }
  }
  table.push([t('budgetTotal', kindName), ...money(kind.total)]);
}

function printBudget(report: BudgetReport): void {
  const regime = t(report.regime === 'cash' ? 'budgetRegimeCash' : 'budgetRegimeAccrual');
  logger.header(t('budgetHeader', report.period.start, report.period.end, regime));
  for (const kind of Object.keys(report.budgets) as BudgetKind[]) {
    const section = report.budgets[kind];
    if (!section) continue;
    const label = kindLabel(kind);
    logger.blank();
    logger.log(label);
    const table = newTable({
      head: [t('labelCategory'), t('budgetGoal'), t('budgetConfirmed'), t('budgetProjected'), t('budgetRemaining'), t('budgetSurplus')],
      style: { head: ['cyan'] },
    });
    pushKind(table, label, section);
    console.log(table.toString());
  }
}

async function budgetAction(options: BudgetOptions): Promise<void> {
  const report = await loadBudget(parseBudgetOptions(options));
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printBudget(report);
}

export const budgetCommand = new Command('budget')
  .description(t('budgetDescription'))
  .option('-m, --month <YYYY-MM>', t('budgetMonthOption'))
  .option('-f, --from <date>', t('budgetFromOption'))
  .option('-t, --to <date>', t('budgetToOption'))
  .option('-r, --regime <regime>', t('budgetRegimeOption'))
  .option('--json', t('jsonOption'))
  .action(action(budgetAction));

registerBudgetWrites(budgetCommand);
