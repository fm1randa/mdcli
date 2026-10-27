import chalk from 'chalk';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchEntry } from '../../lib/api.js';
import { normalizeEntry } from '../../lib/normalize.js';
import { formatStatus, formatType } from './format.js';
import { formatCurrency } from '../../utils/currency.js';
import { loadNames, nameOf, tagNames } from './names.js';
import { parseEntryId } from './entry-id.js';
import { cell, listCell } from '../../utils/text.js';

interface ShowOptions {
  json?: boolean;
  raw?: boolean;
}

const REPETITION_LABELS = { single: 'repetitionSingle', installment: 'repetitionInstallment', fixed: 'repetitionFixed' } as const;

export async function showAction(id: string, options: ShowOptions): Promise<void> {
  const entryId = parseEntryId(id);
  if (options.json && options.raw) {
    exitWithError(t('errorJsonOrRaw'));
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
    [t('labelId'), entry.id],
    [t('labelDescription'), entry.description],
    [t('labelValue'), formatCurrency(entry.value)],
    [t('labelType'), formatType(entry.type)],
    [t('labelStatus'), formatStatus(entry.status)],
    [t('labelPlannedDate'), entry.date],
    [t('labelEffectiveDate'), cell(entry.effectiveDate)],
    [t('labelCompetenceDate'), cell(entry.competenceDate)],
    [t('labelAccount'), nameOf(names.accounts, entry.accountId)],
    [t('labelTransferAccount'), cell(entry.transferAccountId, (id) => String(nameOf(names.accounts, id)))],
    [t('labelCategory'), cell(entry.categoryId, (id) => String(nameOf(names.categories, id)))],
    [t('labelTags'), listCell(tagNames(names, entry.tagIds))],
    [t('labelRepetition'), t(REPETITION_LABELS[entry.repetition]) + (entry.installment && entry.repetition === 'installment' ? ` (${entry.installment})` : '')],
    [t('labelSeries'), cell(entry.seriesId)],
    [t('labelDocumentNumber'), cell(entry.documentNumber)],
    [t('labelNotes'), cell(entry.notes || null)],
  ];
  for (const [label, value] of rows) {
    console.log(`  ${chalk.gray(`${label}:`)} ${value}`);
  }
}
