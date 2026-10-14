import { Command } from 'commander';
import { exitWithError } from '../../utils/action.js';
import { fetchCategories } from '../../lib/api.js';
import { resolveIds } from '../../lib/aliases.js';
import type { EntriesParams } from '../../types/index.js';
import { getCurrentMonthRange } from '../../lib/dates.js';

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

function parseStatusFilter(input: string): number {
  const num = Number(input);
  if (!Number.isNaN(num) && num >= 0 && num <= 15) return num;

  const unknown: string[] = [];
  const mask = input.split(',').reduce((acc, name) => {
    const flag = STATUS_FLAGS[name.trim().toLowerCase()];
    if (!flag) unknown.push(name.trim());
    return acc | (flag ?? 0);
  }, 0);

  if (unknown.length > 0) {
    exitWithError(`Unknown status: ${unknown.join(', ')}. Valid: pending, confirmed, reconciled, scheduled`);
  }

  return mask;
}

function parseTypeFilter(input: string): number {
  const num = Number(input);
  if (!Number.isNaN(num) && num >= 0 && num <= 15) return num;

  const unknown: string[] = [];
  const mask = input.split(',').reduce((acc, name) => {
    const flag = TYPE_FLAGS[name.trim().toLowerCase()];
    if (!flag) unknown.push(name.trim());
    return acc | (flag ?? 0);
  }, 0);

  if (unknown.length > 0) {
    exitWithError(`Unknown type: ${unknown.join(', ')}. Valid: expense, income, transfer-out, transfer-in`);
  }

  return mask;
}

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
}

export async function resolveEntryFilters(options: FilterOptions): Promise<Omit<EntriesParams, 'page' | 'pageSize'>> {
  if (!options.account) {
    exitWithError('At least one account ID or alias is required. Use --account <id> or --account <id1,id2,...>');
  }

  const accountResult = await resolveIds('accounts', options.account);
  if (accountResult.unresolved.length > 0) {
    exitWithError(`Unknown account(s): ${accountResult.unresolved.join(', ')}`);
  }
  if (accountResult.ids.length === 0) {
    exitWithError('At least one account ID or alias is required. Use --account <id> or --account <id1,id2,...>');
  }

  let categoryIds: number[] | undefined;
  if (options.category) {
    const categoryResult = await resolveIds('categories', options.category);
    if (categoryResult.unresolved.length > 0) {
      exitWithError(`Unknown category(ies): ${categoryResult.unresolved.join(', ')}`);
    }
    categoryIds = categoryResult.ids;
  }

  let tagIds: number[] | undefined;
  if (options.tag) {
    const tagResult = await resolveIds('tags', options.tag);
    if (tagResult.unresolved.length > 0) {
      exitWithError(`Unknown tag(s): ${tagResult.unresolved.join(', ')}`);
    }
    tagIds = tagResult.ids;
  }

  let value: number | undefined;
  if (options.value !== undefined) {
    value = Number(options.value);
    if (Number.isNaN(value)) {
      exitWithError('Invalid value. Must be a number.');
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
  };
}

/** Resolves --exclude-category to those categories plus all of their subcategories. */
export async function resolveExcludedCategories(input: string | undefined): Promise<Set<number>> {
  const excluded = new Set<number>();
  if (!input) return excluded;

  const result = await resolveIds('categories', input);
  if (result.unresolved.length > 0) {
    exitWithError(`Unknown category(ies) in --exclude-category: ${result.unresolved.join(', ')}`);
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
    .requiredOption('-a, --account <ids>', 'Account ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated')
    .option('-f, --from <date>', 'Start date (YYYY-MM-DD), defaults to first day of current month')
    .option('-t, --to <date>', 'End date (YYYY-MM-DD), defaults to last day of current month')
    .option('-s, --status <filter>', 'Filter by status: pending, confirmed, reconciled, scheduled (or bitmask 0-15)')
    .option('-T, --type <filter>', 'Filter by type: expense, income, transfer-out, transfer-in (or bitmask 0-15)')
    .option('-c, --category <ids>', 'Filter by category ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated')
    .option('-g, --tag <ids>', 'Filter by tag ID(s), alias(es), or exact name(s) (case-insensitive), comma-separated')
    .option('-k, --keywords <text>', 'Search by keywords')
    .option('-v, --value <amount>', 'Filter by value')
    .option('-x, --exclude-category <ids>', 'Leave out these categories and their subcategories, comma-separated');
}
