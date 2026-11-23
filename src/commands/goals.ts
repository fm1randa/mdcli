import chalk from 'chalk';
import { Command } from 'commander';
import { action, exitWithError } from '../utils/action.js';
import { formatCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';
import { newTable } from '../utils/table.js';
import { cell, truncate } from '../utils/text.js';
import { parseId } from '../utils/parse.js';
import { t } from '../lib/i18n/index.js';
import { fetchAccounts } from '../lib/api.js';
import { dateRange, today, type DateRange } from '../lib/dates.js';
import { loadGoalStatement, loadGoalSummaries, type GoalStatement, type GoalSummary } from '../lib/savings-goals.js';
import { parsePeriodOptions, type PeriodOptions } from './period-options.js';
import { formatStatus } from './entries/format.js';

const DESCRIPTION_WIDTH = 32;

function percentLabel(percent: number | null): string {
  return cell(percent, (value) => `${value.toFixed(2)}%`);
}

function rateLabel(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function printList(goals: readonly GoalSummary[], showStatus: boolean): void {
  if (goals.length === 0) {
    logger.log(t('goalsNone'));
    return;
  }
  const head = [
    'ID', t('labelDescription'), t('goalTarget'), t('goalDeadline'), t('goalBalance'),
    t('goalRemaining'), t('goalPercent'), t('goalIdealMonthly'),
  ];
  const table = newTable({ head: showStatus ? [...head, t('goalStatus')] : head, style: { head: ['cyan'] } });
  for (const goal of goals) {
    const row = [
      goal.id,
      truncate(goal.description, DESCRIPTION_WIDTH),
      formatCurrency(goal.target),
      goal.deadline,
      formatCurrency(goal.balance),
      formatCurrency(goal.remaining),
      percentLabel(goal.percent),
      formatCurrency(goal.idealMonthlyContribution),
    ];
    table.push(showStatus ? [...row, t(goal.active ? 'goalActive' : 'goalInactive')] : row);
  }
  logger.header(t('goalsListHeader', goals.length));
  console.log(table.toString());
}

interface ListOptions {
  all?: boolean;
  json?: boolean;
}

async function listAction(options: ListOptions): Promise<void> {
  const goals = await loadGoalSummaries(Boolean(options.all));
  if (options.json) {
    console.log(JSON.stringify(goals, null, 2));
    return;
  }
  printList(goals, Boolean(options.all));
}

type AccountNames = Map<number, string>;

function accountName(names: AccountNames, id: number): string {
  return names.get(id) ?? String(id);
}

function printSummary(goal: GoalSummary, names: AccountNames): void {
  logger.header(`${goal.description} (${goal.id})`);
  const rows: [string, string][] = [
    [t('goalStatus'), t(goal.active ? 'goalActive' : 'goalInactive')],
    [t('goalTarget'), formatCurrency(goal.target)],
    [t('goalDeadline'), goal.deadline],
    [t('goalMonthlyRate'), rateLabel(goal.monthlyRate)],
    [t('goalBalance'), formatCurrency(goal.balance)],
    [t('goalRemaining'), formatCurrency(goal.remaining)],
    [t('goalPercent'), percentLabel(goal.percent)],
    [t('goalIdealMonthly'), formatCurrency(goal.idealMonthlyContribution)],
  ];
  if (goal.webIdealMonthlyContribution !== goal.idealMonthlyContribution) {
    rows.push([t('goalWebIdealMonthly'), formatCurrency(goal.webIdealMonthlyContribution)]);
  }
  for (const [label, value] of rows) console.log(`  ${chalk.gray(`${label}:`)} ${value}`);
  logger.blank();
  logger.log(t('goalAccounts'));
  const accounts = newTable({ head: [t('labelAccount'), t('goalBalance')], style: { head: ['cyan'] } });
  for (const account of goal.accounts) accounts.push([accountName(names, account.accountId), formatCurrency(account.balance)]);
  console.log(accounts.toString());
}

function printStatement(statement: GoalStatement, names: AccountNames): void {
  logger.blank();
  logger.log(t('goalStatementHeader', statement.period.start, statement.period.end));
  const table = newTable({
    head: [t('labelDate'), t('labelDescription'), t('labelAccount'), t('labelStatus'), t('labelValue'), t('goalBalance')],
    style: { head: ['cyan'] },
  });
  const opening = statement.opening;
  const openingLabel = t(opening.kind === 'initial' ? 'goalOpeningInitial' : 'goalOpeningPrevious');
  table.push([opening.date, openingLabel, '', '', '', formatCurrency(opening.balance)]);
  for (const entry of statement.entries) {
    table.push([
      entry.date,
      truncate(entry.description, DESCRIPTION_WIDTH),
      accountName(names, entry.accountId),
      formatStatus(entry.status),
      formatCurrency(entry.value),
      formatCurrency(entry.balance),
    ]);
  }
  table.push([statement.period.end, t('goalClosing'), '', '', '', formatCurrency(statement.closingBalance)]);
  console.log(table.toString());
  if (statement.entries.length === 0) logger.log(t('goalStatementEmpty'));
}

interface ShowOptions extends PeriodOptions {
  json?: boolean;
}

/** The web's default statement period: the current calendar year. */
function currentYear(): DateRange {
  const year = today().slice(0, 4);
  const range = dateRange(`${year}-01-01`, `${year}-12-31`);
  if (!range) throw new Error(`invalid year: ${year}`);
  return range;
}

async function showAction(id: string, options: ShowOptions): Promise<void> {
  const goalId = parseId(id);
  if (goalId === undefined) exitWithError(t('errorInvalidGoalId', id));
  const period = parsePeriodOptions(options, currentYear());
  const statement = await loadGoalStatement(goalId, period);
  if (!statement) exitWithError(t('errorGoalNotFound', goalId));
  if (options.json) {
    console.log(JSON.stringify(statement, null, 2));
    return;
  }
  const accounts = await fetchAccounts();
  const names: AccountNames = new Map(accounts.items.map((account) => [account.id, account.nome]));
  printSummary(statement.goal, names);
  printStatement(statement, names);
}

const listCommand = new Command('list')
  .description(t('goalsListDescription'))
  .option('-a, --all', t('goalsListAllOption'))
  .option('--json', t('jsonOption'))
  .action(action(listAction));

const showCommand = new Command('show')
  .description(t('goalsShowDescription'))
  .argument('<id>')
  .option('-m, --month <YYYY-MM>', t('goalsMonthOption'))
  .option('-f, --from <date>', t('goalsFromOption'))
  .option('-t, --to <date>', t('goalsToOption'))
  .option('--json', t('jsonOption'))
  .action(action(showAction));

export const goalsCommand = new Command('goals')
  .description(t('goalsDescription'))
  .addCommand(listCommand)
  .addCommand(showCommand);
