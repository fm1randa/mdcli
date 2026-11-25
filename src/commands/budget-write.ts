import type { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { action, exitAfterFlush, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import { formatCurrency } from '../utils/currency.js';
import { parseAmount } from '../utils/parse.js';
import { t } from '../lib/i18n/index.js';
import { isYearMonth, monthRange, today } from '../lib/dates.js';
import { fetchCategories, saveBudgetGoals } from '../lib/api.js';
import { ApiError } from '../lib/api-error.js';
import { resolveId } from '../lib/aliases.js';
import { resolveCategoryReference } from '../lib/category-resolution.js';
import { loadBudget } from '../lib/budget.js';
import {
  buildSavePayload,
  findConflicts,
  formatConflicts,
  MAX_GOAL_MONTHS,
  monthSpan,
  renderConflicts,
  type GoalCategory,
  type GoalWrite,
} from '../lib/budget-write.js';
import type { BudgetGoalSave } from '../types/budget.js';
import type { Category } from '../types/index.js';
import { mapConcurrent } from '../utils/concurrency.js';

// Months whose goals are read at once before a write: a long --until span
// waits less, and the API still sees only a few requests in flight.
const MONTH_READ_CONCURRENCY = 4;

/** --month and --json belong to `budget`, which parses them wherever they appear; optsWithGlobals() merges them in. */
interface WriteFlags {
  category: string;
  month?: string;
  until?: string;
  dryRun?: boolean;
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

interface SetFlags extends WriteFlags {
  value: string;
}

async function setBudgetAction(_options: SetFlags, command: Command): Promise<void> {
  const options = command.optsWithGlobals<SetFlags>();
  const amount = parseAmount(options.value);
  if (amount === undefined) exitWithError(t('errorInvalidValue', options.value));
  if (amount === 0) exitWithError(t('errorBudgetZero'));
  await writeBudget(options, amount);
}

async function removeBudgetAction(_options: WriteFlags, command: Command): Promise<void> {
  await writeBudget(command.optsWithGlobals<WriteFlags>(), 0);
}

async function writeBudget(options: WriteFlags, value: number): Promise<void> {
  const { write, categories } = await resolveWrite(options, value);
  const reports = await mapConcurrent(write.months, MONTH_READ_CONCURRENCY, (month) =>
    loadBudget({ period: monthRange(month), regime: 'cash' }, categories)
  );
  write.months.forEach((month, i) => {
    const conflicts = findConflicts(reports[i], write);
    if (conflicts.length > 0) exitWithError(formatConflicts(conflicts, month));
  });

  const payload = buildSavePayload(write);
  if (options.dryRun) {
    printPlan(write, payload, true, options.json === true);
    return;
  }
  if (options.json && !options.dangerouslySkipConfirmation) exitWithError(t('errorBudgetJsonNeedsSkip'));
  if (!options.dangerouslySkipConfirmation) await confirm(write);
  try {
    await saveBudgetGoals(payload);
  } catch (error) {
    const words = error instanceof ApiError && error.status === 422 ? renderConflicts(error.body) : null;
    if (words) exitWithError(words.join('\n'));
    throw error;
  }
  printPlan(write, payload, false, options.json === true);
}

/** The write, and the category catalog it was resolved against, so the month reads reuse it. */
async function resolveWrite(options: WriteFlags, value: number): Promise<{ write: GoalWrite; categories: Category[] }> {
  const month = options.month ?? today().slice(0, 7);
  if (!isYearMonth(month)) exitWithError(t('errorInvalidBudgetMonth', month));
  if (options.until !== undefined && !isYearMonth(options.until)) exitWithError(t('errorInvalidBudgetMonth', options.until));
  if (options.until !== undefined && options.until < month) exitWithError(t('errorBudgetUntilBefore', options.until, month));
  const months = monthSpan(month, options.until);
  if (!months) exitWithError(t('errorBudgetSpanTooLong', MAX_GOAL_MONTHS));
  const categories = (await fetchCategories()).items;
  return { write: { category: await resolveGoalCategory(options.category, categories), value, months }, categories };
}

async function resolveGoalCategory(input: string, items: Category[]): Promise<GoalCategory> {
  const resolution = resolveCategoryReference(input, await resolveId('categories', input), items);
  if (resolution.kind === 'ambiguous') exitWithError(t('errorCategoryNameAmbiguous', input, resolution.ids.join(', ')));
  if (resolution.kind === 'inactive') exitWithError(t('errorCategoryInactiveDestination', resolution.category.nome, resolution.category.id));
  if (resolution.kind !== 'resolved') exitWithError(t('errorCategoryNotFound', input));
  if (resolution.category.tipo === 't') exitWithError(t('errorBudgetTransfer', resolution.category.nome));
  return {
    id: resolution.category.id,
    name: resolution.category.nomeRel || resolution.category.nome,
    tipo: resolution.category.tipo,
    parentId: resolution.category.pai ?? null,
  };
}

async function confirm(write: GoalWrite): Promise<void> {
  const question = write.value === 0
    ? t('confirmBudgetRemove', write.category.name, write.category.id, monthsOf(write))
    : t('confirmBudgetSet', write.category.name, write.category.id, formatCurrency(write.value), monthsOf(write));
  if (await promptConfirmation(question)) return;
  logger.info(t('budgetWriteCancelled'));
  await exitAfterFlush(0);
}

function printPlan(write: GoalWrite, payload: BudgetGoalSave, dryRun: boolean, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(dryRun ? payload : savedBody(write), null, 2));
    return;
  }
  const months = monthsOf(write);
  const name = write.category.name;
  const id = write.category.id;
  if (dryRun) {
    logger.info(write.value === 0
      ? t('budgetDryRunRemove', name, id, months)
      : t('budgetDryRunSet', name, id, formatCurrency(write.value), months));
    return;
  }
  logger.success(write.value === 0
    ? t('budgetRemoveDone', name, id, months)
    : t('budgetSetDone', name, id, formatCurrency(write.value), months));
}

function savedBody(write: GoalWrite): { saved: true; categoryId: number; tipo: 'd' | 'r'; meta: number; months: readonly string[] } {
  return { saved: true, categoryId: write.category.id, tipo: write.category.tipo, meta: write.value, months: write.months };
}

function monthsOf(write: GoalWrite): string {
  return write.months.join(', ');
}

export function registerBudgetWrites(budget: Command): void {
  budget
    .command('set')
    .description(t('budgetSetDescription'))
    .requiredOption('--category <ref>', t('budgetSetCategoryOption'))
    .requiredOption('--value <amount>', t('budgetSetValueOption'))
    .option('--until <YYYY-MM>', t('budgetSetUntilOption'))
    .option('--dry-run', t('budgetDryRunOption'))
    .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
    .configureHelp({ showGlobalOptions: true })
    .action(action(setBudgetAction));

  budget
    .command('remove')
    .description(t('budgetRemoveDescription'))
    .requiredOption('--category <ref>', t('budgetRemoveCategoryOption'))
    .option('--until <YYYY-MM>', t('budgetSetUntilOption'))
    .option('--dry-run', t('budgetDryRunOption'))
    .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
    .configureHelp({ showGlobalOptions: true })
    .action(action(removeBudgetAction));
}
