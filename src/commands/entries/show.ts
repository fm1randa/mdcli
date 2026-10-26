import chalk from 'chalk';
import { exitWithError } from '../../utils/action.js';
import { fetchEntry } from '../../lib/api.js';
import { normalizeEntry } from '../../lib/normalize.js';
import { formatStatus, formatType } from './format.js';
import { formatCurrency } from '../../utils/currency.js';
import { loadNames, nameOf, tagNames } from './names.js';
import { parseEntryId } from './entry-id.js';
import { cell } from '../../utils/text.js';

interface ShowOptions {
  json?: boolean;
  raw?: boolean;
}

const REPETITION_LABELS = { single: 'Single', installment: 'Installment', fixed: 'Fixed' } as const;

export async function showAction(id: string, options: ShowOptions): Promise<void> {
  const entryId = parseEntryId(id);
  if (options.json && options.raw) {
    exitWithError('Use either --json or --raw, not both.');
  }

  const raw = await fetchEntry(entryId);
  if (options.raw) {
    console.log(JSON.stringify(raw, null, 2));
    return;
  }
  const entry = normalizeEntry(raw);
  if (options.json) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  const names = await loadNames({ tags: entry.tagIds.length > 0 });
  const rows: [string, string | number][] = [
    ['ID', entry.id],
    ['Description', entry.description],
    ['Value', formatCurrency(entry.value)],
    ['Type', formatType(entry.type)],
    ['Status', formatStatus(entry.status)],
    ['Planned date', entry.date],
    ['Effective date', cell(entry.effectiveDate)],
    ['Competence date', cell(entry.competenceDate)],
    ['Account', nameOf(names.accounts, entry.accountId)],
    ['Transfer account', cell(entry.transferAccountId, (id) => String(nameOf(names.accounts, id)))],
    ['Category', cell(entry.categoryId, (id) => String(nameOf(names.categories, id)))],
    ['Tags', cell(entry.tagIds.length > 0 ? tagNames(names, entry.tagIds).join(', ') : null)],
    ['Repetition', REPETITION_LABELS[entry.repetition] + (entry.installment && entry.repetition === 'installment' ? ` (${entry.installment})` : '')],
    ['Series', cell(entry.seriesId)],
    ['Document number', cell(entry.documentNumber)],
    ['Notes', cell(entry.notes || null)],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${chalk.gray(`${label}:`)} ${value}`);
  }
}
