import { apiGet, fetchSavingsGoals } from './api.js';
import { addInterval, today, type DateRange } from './dates.js';
import { t } from './i18n/index.js';
import { normalizeEntry } from './normalize.js';
import type { Entry, NormalizedEntry, SavingsGoal } from '../types/index.js';
import { roundToCents } from '../utils/currency.js';
import { parseInteger } from '../utils/parse.js';

const GOALS_PATH = '/v1/metas/economia';

/** One destination account and its balance (saldo + saldoInicial, as the web's chart adds them). */
interface GoalAccountBalance {
  readonly accountId: number;
  readonly balance: number;
}

/** A savings goal with the figures the web's Metas de economia screen shows. */
export interface GoalSummary {
  readonly id: number;
  readonly description: string;
  readonly active: boolean;
  readonly target: number;
  readonly deadline: string;
  readonly monthlyRate: number;
  readonly balance: number;
  /** target - balance, the web's "A realizar"; negative once the target is passed. */
  readonly remaining: number;
  /** balance / target in percent, two decimals; null for a target of 0. */
  readonly percent: number | null;
  /**
   * The CLI's ideal monthly contribution. With months left it is the web's;
   * with none it is what is still missing, never below 0.
   */
  readonly idealMonthlyContribution: number;
  /** The web's figure, which is the whole target when no month is left. */
  readonly webIdealMonthlyContribution: number;
  readonly accounts: readonly GoalAccountBalance[];
}

/** The balance before the statement's first day. `initial` is the web's "Saldo inicial" row. */
interface StatementOpening {
  readonly kind: 'initial' | 'previous';
  readonly date: string;
  readonly balance: number;
}

/** One statement entry and the goal's running balance after it. */
type StatementEntry = NormalizedEntry & { readonly balance: number };

export interface GoalStatement {
  readonly goal: GoalSummary;
  readonly period: DateRange;
  readonly opening: StatementOpening;
  readonly entries: readonly StatementEntry[];
  readonly closingBalance: number;
}

/** A goal with every figure `goals` reads. */
type GoalAccountFigures = Required<SavingsGoal['contas'][number]>;
type FiguredGoal = Required<Omit<SavingsGoal, 'dataSaldo' | 'contas'>> & Pick<SavingsGoal, 'dataSaldo'> & { contas: GoalAccountFigures[] };

const FIGURES = ['valor', 'data', 'taxa', 'saldo', 'saldoInicial', 'dataSaldoInicial'] as const;

/** The goal with its figures, which the API always sends; an answer without them is refused, not read as 0. */
function figured(goal: SavingsGoal): FiguredGoal {
  const missing = FIGURES.filter((field) => goal[field] === undefined);
  const accounts = goal.contas.filter((account) => account.saldo === undefined || account.saldoInicial === undefined);
  if (missing.length > 0 || accounts.length > 0) {
    const fields = [...missing, ...accounts.map((a) => `contas[${a.conta}]`)].join(', ');
    throw new Error(t('errorGoalMissingFigures', GOALS_PATH, goal.id, fields));
  }
  return goal as FiguredGoal;
}

/** The goals sorted by description, as the web lists them; inactive ones only with `includeInactive`. */
export async function loadGoalSummaries(includeInactive: boolean): Promise<GoalSummary[]> {
  const goals = await fetchSavingsGoals();
  return goals
    .filter((goal) => includeInactive || goal.status)
    .sort((left, right) => left.descricao.localeCompare(right.descricao, 'pt-BR') || left.id - right.id)
    .map((goal) => summarize(figured(goal)));
}

/** The goal names by id, for entries that carry a savings goal id. */
export async function loadGoalNames(): Promise<Map<number, string>> {
  const goals = await fetchSavingsGoals();
  return new Map(goals.map((goal) => [goal.id, goal.descricao]));
}

/** The goal with `id` and its statement over `period`; null when no goal has that id. */
export async function loadGoalStatement(id: number, period: DateRange): Promise<GoalStatement | null> {
  const goals = await fetchSavingsGoals();
  const found = goals.find((candidate) => candidate.id === id);
  if (!found) return null;
  const goal = figured(found);
  const before = addInterval(period.start, -1, 'd');
  const query = new URLSearchParams({ inicio: period.start, fim: period.end });
  const [rows, openingBalance] = await Promise.all([
    apiGet<Entry[]>(`${GOALS_PATH}/${id}/lancamentos?${query.toString()}`),
    apiGet<number>(`${GOALS_PATH}/${id}/saldo?${new URLSearchParams({ data: before }).toString()}`),
  ]);
  let balance = openingBalance;
  const entries = rows.map((row) => {
    balance = roundToCents(balance + row.valor);
    return { ...normalizeEntry(row), balance };
  });
  return { goal: summarize(goal), period, opening: openingOf(goal, period.start, before, openingBalance), entries, closingBalance: balance };
}

/**
 * The web's label for the opening row: "Saldo inicial" when the goal starts in
 * the statement's year and the balance before it is still the initial one.
 * The web compares years because its statement period is a year.
 */
function openingOf(goal: FiguredGoal, start: string, before: string, balance: number): StatementOpening {
  const initial = goal.dataSaldoInicial.slice(0, 4) === start.slice(0, 4) && balance === goal.saldoInicial;
  return initial
    ? { kind: 'initial', date: goal.dataSaldoInicial.slice(0, 10), balance }
    : { kind: 'previous', date: before, balance };
}

function summarize(goal: FiguredGoal): GoalSummary {
  const remaining = roundToCents(goal.valor - goal.saldo);
  const contribution = monthlyContribution(goal);
  return {
    id: goal.id,
    description: goal.descricao,
    active: goal.status,
    target: goal.valor,
    deadline: goal.data.slice(0, 10),
    monthlyRate: goal.taxa,
    balance: goal.saldo,
    remaining,
    percent: goal.valor === 0 ? null : roundToCents((goal.saldo / goal.valor) * 100),
    idealMonthlyContribution: contribution.monthsLeft <= 0 ? Math.max(0, remaining) : contribution.web,
    webIdealMonthlyContribution: contribution.web,
    accounts: goal.contas.map((account) => ({ accountId: account.conta, balance: roundToCents(account.saldo + account.saldoInicial) })),
  };
}

/** Months since year 0 of a YYYY-MM-DD date, so a difference is the web's moment diff of month starts. */
function monthIndex(date: string): number {
  const year = parseInteger(date.slice(0, 4));
  const month = parseInteger(date.slice(5, 7));
  if (year === undefined || month === undefined) throw new Error(t('errorInvalidGoalDate', date));
  return year * 12 + month - 1;
}

/**
 * The web's aplicacaoMensal (mdb.js metaseconomiaService). The contributions
 * still to make run from the month after the latest movement (or from the
 * initial balance's month while nothing moved) to the deadline's month; the
 * balance compounds at `taxa` from the current month to the deadline. With no
 * contribution month left the web answers the whole target.
 */
function monthlyContribution(goal: FiguredGoal): { monthsLeft: number; web: number } {
  const moved = goal.saldo !== goal.saldoInicial ? 1 : 0;
  const deadline = monthIndex(goal.data);
  const monthsLeft = deadline - (monthIndex(goal.dataSaldo || goal.dataSaldoInicial) + moved);
  if (monthsLeft <= 0) return { monthsLeft, web: goal.valor };
  const rate = goal.taxa;
  const growth = deadline - monthIndex(today());
  const gap = goal.valor - goal.saldo * Math.pow(1 + rate, growth);
  const raw = rate !== 0
    ? (gap * rate) / ((1 + rate) * (Math.pow(1 + rate, monthsLeft) - 1))
    : (goal.valor - goal.saldo) / monthsLeft;
  return { monthsLeft, web: roundToCents(Math.max(0, raw || 0)) };
}
