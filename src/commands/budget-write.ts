import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { action, exitAfterFlush, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import { formatCurrency } from '../utils/currency.js';
import { parseAmount } from '../utils/parse.js';
import { t } from '../lib/i18n/index.js';
import { isYearMonth, monthRange, today } from '../lib/dates.js';
import { fetchCategories, apiPost } from '../lib/api.js';
import { ApiError } from '../lib/api-error.js';
import { resolveId } from '../lib/aliases.js';
import { resolveCategoryReference } from '../lib/category-resolution.js';
import { loadBudget } from '../lib/budget.js';
import {
  buildSavePayload,
  findConflicts,
  formatConflicts,
  monthSpan,
  renderConflicts,
  type GoalCategory,
  type GoalWrite,
} from '../lib/budget-write.js';
import type { BudgetGoalSave } from '../types/budget.js';

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

/** POST /v1/metas/orcamento. The success body is unused; the next `mdcli budget` is the check. */
function saveBudgetGoals(payload: BudgetGoalSave): Promise<unknown> {
  return apiPost<unknown>('/v1/metas/orcamento', payload);
}

async function setBudgetAction(options: SetFlags, command: Command): Promise<void> {
  const flags = withParentFlags(options, command);
  const amount = parseAmount(flags.value);
  if (amount === undefined) exitWithError(t('errorInvalidValue', flags.value));
  if (amount === 0) exitWithError(t('errorBudgetZero'));
  await writeBudget(flags, amount);
}

async function removeBudgetAction(options: WriteFlags, command: Command): Promise<void> {
  await writeBudget(withParentFlags(options, command), 0);
}

/**
 * `budget` already has `--month` and `--json` for the read. Commander parses
 * those on the parent before set/remove sees them, so a flag after the
 * subcommand name lands on the parent. The subcommand's own copy still wins
 * when Commander did give it the value.
 */
function withParentFlags<T extends WriteFlags>(options: T, command: Command): T {
  const parent = command.parent?.opts() as Partial<WriteFlags> | undefined;
  return {
    ...options,
    month: options.month ?? parent?.month,
    json: options.json === true || parent?.json === true,
  };
}

async function writeBudget(options: WriteFlags, value: number): Promise<void> {
  const write = await resolveWrite(options, value);
  for (const month of write.months) {
    const report = await loadBudget({ period: monthRange(month), regime: 'cash' });
    const conflicts = findConflicts(report, write);
    if (conflicts.length > 0) exitWithError(formatConflicts(conflicts, month));
  }

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

async function resolveWrite(options: WriteFlags, value: number): Promise<GoalWrite> {
  const month = options.month ?? today().slice(0, 7);
  if (!isYearMonth(month)) exitWithError(t('errorInvalidBudgetMonth', month));
  if (options.until !== undefined && !isYearMonth(options.until)) exitWithError(t('errorInvalidBudgetMonth', options.until));
  if (options.until !== undefined && options.until < month) exitWithError(t('errorBudgetUntilBefore', options.until, month));
  const months = monthSpan(month, options.until);
  if (!months) exitWithError(t('errorBudgetSpanTooLong'));
  return { category: await resolveGoalCategory(options.category), value, months };
}

async function resolveGoalCategory(input: string): Promise<GoalCategory> {
  const items = (await fetchCategories()).items;
  const resolution = resolveCategoryReference(input, await resolveId('categories', input), items);
  if (resolution.kind === 'ambiguous') exitWithError(t('errorCategoryNameAmbiguous', input, resolution.ids.join(', ')));
  if (resolution.kind === 'inactive') exitWithError(t('errorCategoryInactiveDestination', resolution.category.nome, resolution.category.id));
  if (resolution.kind !== 'resolved') exitWithError(t('errorCategoryNotFound', input));
  if (resolution.category.tipo === 't') exitWithError(t('errorBudgetTransfer', resolution.category.nome));
  return {
    id: resolution.category.id,
    name: resolution.category.nomeRel || resolution.category.nome,
    tipo: resolution.category.tipo,
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
    .option('--month <YYYY-MM>', t('budgetSetMonthOption'))
    .option('--until <YYYY-MM>', t('budgetSetUntilOption'))
    .option('--dry-run', t('budgetDryRunOption'))
    .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
    .option('--json', t('jsonOption'))
    .action(action(setBudgetAction));

  budget
    .command('remove')
    .description(t('budgetRemoveDescription'))
    .requiredOption('--category <ref>', t('budgetRemoveCategoryOption'))
    .option('--month <YYYY-MM>', t('budgetSetMonthOption'))
    .option('--until <YYYY-MM>', t('budgetSetUntilOption'))
    .option('--dry-run', t('budgetDryRunOption'))
    .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
    .option('--json', t('jsonOption'))
    .action(action(removeBudgetAction));
}
