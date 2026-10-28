import { Command } from 'commander';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchCategories } from '../../lib/api.js';
import { resolveIds } from '../../lib/aliases.js';
import { resolveTags } from './tags.js';
import type { EntriesParams } from '../../types/index.js';
import { getCurrentMonthRange, isCalendarDate } from '../../lib/dates.js';
import { parseAmount, parseInteger } from '../../utils/parse.js';

// The API answers 400 "A data limite de carregamento dos lançamentos é
// 31/12/2031" for any later end date.
const LAST_LOADABLE_DATE = '2031-12-31';

function checkDateRange(from: string | undefined, to: string | undefined): void {
  for (const [flag, value] of [['--from', from], ['--to', to]] as const) {
    if (value !== undefined && !isCalendarDate(value)) {
      exitWithError(t('errorInvalidFilterDate', flag, value));
    }
  }
  if (to !== undefined && to > LAST_LOADABLE_DATE) {
    exitWithError(t('errorPastLastLoadableDate', to, LAST_LOADABLE_DATE));
  }
}

// The one copy of the API's status and tipoLancamento bits
// (docs/api-filters.md): the CLI names map to them, and the invoice items the
// API does not filter are matched against them (card-entries.ts).
const STATUS_FLAGS: Record<string, number> = {
  pending: 1,
  confirmed: 2,
  reconciled: 4,
  scheduled: 8,
};

const TYPE_FLAGS: Record<string, number> = {
  expense: 1,
  income: 2,
  'transfer-out': 4,
  'transfer-in': 8,
};

// An entry's status as the API labels it -> its CLI name. nconciliado is
// confirmed but not reconciled.
const API_STATUS_NAMES: Record<string, string> = {
  pendente: 'pending',
  confirmado: 'confirmed',
  nconciliado: 'confirmed',
  conciliado: 'reconciled',
  agendado: 'scheduled',
};

/** The status bit of an entry's API status label; undefined for a label the API does not filter on. */
export function statusBit(apiStatus: string): number | undefined {
  const name = API_STATUS_NAMES[apiStatus];
  return name === undefined ? undefined : STATUS_FLAGS[name];
}

/**
 * The tipoLancamento bit of an entry. tipo p (invoice payment) has no bit in
 * the web's mask, so it is 0 and matches no type filter.
 */
export function typeBit(entry: { tipo?: string; valor: number }): number {
  if (entry.tipo === 'p') return 0;
  if (entry.tipo === 'r') return TYPE_FLAGS.income;
  if (entry.tipo === 't') return entry.valor < 0 ? TYPE_FLAGS['transfer-out'] : TYPE_FLAGS['transfer-in'];
  return TYPE_FLAGS.expense;
}

// The web app's Repetição filter (tipoRepeticao): única, parcelada, fixa.
const REPETITION_FLAGS: Record<string, number> = {
  single: 1,
  installment: 2,
  installments: 2,
  fixed: 4,
};

/** Turns comma-separated names (or a raw bitmask up to `max`) into the API bitmask. */
function parseFlagFilter(input: string, flags: Record<string, number>, max: number, label: string, valid: string): number {
  const num = parseInteger(input);
  if (num !== undefined && num <= max) return num;

  const unknown: string[] = [];
  const mask = input.split(',').reduce((acc, name) => {
    const flag = flags[name.trim().toLowerCase()];
    if (!flag) unknown.push(name.trim());
    return acc | (flag ?? 0);
  }, 0);

  if (unknown.length > 0) {
    exitWithError(t('errorUnknownFilterValue', label, unknown.join(', '), valid));
  }

  return mask;
}

const parseStatusFilter = (input: string) =>
  parseFlagFilter(input, STATUS_FLAGS, 15, t('filterLabelStatus'), 'pending, confirmed, reconciled, scheduled');
const parseTypeFilter = (input: string) =>
  parseFlagFilter(input, TYPE_FLAGS, 15, t('filterLabelType'), 'expense, income, transfer-out, transfer-in');
const parseRepetitionFilter = (input: string) =>
  parseFlagFilter(input, REPETITION_FLAGS, 7, t('filterLabelRepetition'), 'single, installment, fixed');

export interface FilterOptions {
  account?: string;
  from?: string;
  to?: string;
  status?: string;
  type?: string;
  category?: string;
  tag?: string;
  keywords?: string;
  value?: string;
  excludeCategory?: string;
  repetition?: string;
  /** Commander --no-invoices; default true (API faturas). */
  invoices?: boolean;
}

export async function resolveEntryFilters(options: FilterOptions): Promise<Omit<EntriesParams, 'page' | 'pageSize'>> {
  if (!options.account) {
    exitWithError(t('errorAccountRequired'));
  }
  checkDateRange(options.from, options.to);

  const accountResult = await resolveIds('accounts', options.account);
  if (accountResult.unresolved.length > 0) {
    exitWithError(t('errorUnknownAccounts', accountResult.unresolved.join(', ')));
  }
  if (accountResult.ids.length === 0) {
    exitWithError(t('errorAccountRequired'));
  }

  let categoryIds: number[] | undefined;
  if (options.category) {
    const categoryResult = await resolveIds('categories', options.category);
    if (categoryResult.unresolved.length > 0) {
      exitWithError(t('errorUnknownCategories', categoryResult.unresolved.join(', ')));
    }
    categoryIds = categoryResult.ids;
  }

  const tagIds = options.tag ? await resolveTags(options.tag) : undefined;

  let value: number | undefined;
  if (options.value !== undefined) {
    value = parseAmount(options.value);
    if (value === undefined) {
      exitWithError(t('errorInvalidValue', options.value));
    }
  }

  const { startDate: defaultStart, endDate: defaultEnd } = getCurrentMonthRange();

  return {
    accountIds: accountResult.ids,
    startDate: options.from ?? defaultStart,
    endDate: options.to ?? defaultEnd,
    categoryIds,
    tagIds,
    keywords: options.keywords,
    value,
    status: options.status ? parseStatusFilter(options.status) : undefined,
    entryType: options.type ? parseTypeFilter(options.type) : undefined,
    repetition: options.repetition ? parseRepetitionFilter(options.repetition) : undefined,
    includeFaturas: options.invoices,
  };
}

/** Resolves --exclude-category to those categories plus all of their subcategories. */
export async function resolveExcludedCategories(input: string | undefined): Promise<Set<number>> {
  const excluded = new Set<number>();
  if (!input) return excluded;

  const result = await resolveIds('categories', input);
  if (result.unresolved.length > 0) {
    exitWithError(t('errorUnknownCategoriesExclude', result.unresolved.join(', ')));
  }

  const { items } = await fetchCategories();
  const pending = [...result.ids];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (excluded.has(id)) continue;
    excluded.add(id);
    pending.push(...items.filter((c) => c.pai === id).map((c) => c.id));
  }
  return excluded;
}

export function addFilterOptions(command: Command): Command {
  return command
    .requiredOption('-a, --account <ids>', t('entriesFilterAccountOption'))
    .option('-f, --from <date>', t('entriesFilterFromOption'))
    .option('-t, --to <date>', t('entriesFilterToOption'))
    .option('-s, --status <filter>', t('entriesFilterStatusOption'))
    .option('-T, --type <filter>', t('entriesFilterTypeOption'))
    .option('-R, --repetition <filter>', t('entriesFilterRepetitionOption'))
    .option('-c, --category <ids>', t('entriesFilterCategoryOption'))
    .option('-g, --tag <ids>', t('entriesFilterTagOption'))
    .option('-k, --keywords <text>', t('entriesFilterKeywordsOption'))
    .option('-v, --value <amount>', t('entriesFilterValueOption'))
    .option('-x, --exclude-category <ids>', t('entriesFilterExcludeCategoryOption'))
    .option('--no-invoices', t('entriesFilterNoInvoicesOption'));
}
