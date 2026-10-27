import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { parseId } from '../../utils/parse.js';

/**
 * What POST /v1/lancamentos answered for a card purchase (Finanças,
 * 2026-10-16): "<series>A<date>", e.g. "46349170A2026-10-20". It is not an
 * entry ID: GET/PUT/DELETE /v1/lancamentos/:id need the numeric one.
 */
const OCCURRENCE_ID = /^\d+A\d{4}-\d{2}-\d{2}$/;

export function isEntryId(id: unknown): boolean {
  return (typeof id === 'number' && Number.isInteger(id)) || (typeof id === 'string' && /^\d+$/.test(id));
}

/** The numeric entry ID from a CLI argument, or exit with a hint. */
export function parseEntryId(id: string): number {
  const entryId = parseId(id);
  if (entryId !== undefined) return entryId;
  if (OCCURRENCE_ID.test(id)) {
    exitWithError(t('errorSeriesOccurrenceId', id));
  }
  exitWithError(t('errorInvalidEntryId'));
}
