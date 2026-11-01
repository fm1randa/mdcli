import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { parseId, parseInteger } from '../../utils/parse.js';
import { fetchAllEntries } from '../../lib/api.js';
import { toCents } from '../../utils/currency.js';
import { shiftDueDate } from '../../lib/dates.js';
import type { CreateEntryResponse } from '../../types/index.js';

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

/**
 * A future pending entry on a regular account comes back from POST with the
 * same occurrence ID a card purchase does ("<agenda>A<date>", #165); its
 * numeric entry ID only shows up in the entries list. Match the created entry
 * there (account, description, value and planned date) and answer with its ID,
 * keeping the API's occurrence ID alongside, like withCardEntryId does.
 */
export async function withScheduledEntryId(
  response: CreateEntryResponse,
  scheduled: { accountId: number; date: string; description: string; value: number }
): Promise<CreateEntryResponse & { occurrenceId?: string }> {
  if (isEntryId(response.id)) return response;
  // The list's date range filters on dataPrevista (normalize.ts), so one month
  // around the planned date covers the entry wherever its `data` falls.
  const month = scheduled.date.slice(0, 7);
  const startDate = `${month}-01`;
  // Day 31 clamps to the month's last day (shiftDueDate: 31 -> Feb 28).
  const endDate = shiftDueDate(`${month}-31`, 0);
  const entries = await fetchAllEntries({ accountIds: [scheduled.accountId], startDate, endDate });
  const ids = entries
    .filter((e) =>
      e.descricao === scheduled.description &&
      toCents(e.valor) === toCents(scheduled.value) &&
      e.dataPrevista?.slice(0, 10) === scheduled.date &&
      isEntryId(e.id)
    )
    .flatMap((e) => {
      const id = typeof e.id === 'number' ? e.id : parseInteger(e.id);
      return id === undefined ? [] : [id];
    });
  if (ids.length === 0) {
    // stderr: stdout stays machine-readable under --json.
    console.error(t('warningScheduledEntryIdNotFound', String(response.id), scheduled.accountId));
    return response;
  }
  return { ...response, id: Math.max(...ids), occurrenceId: String(response.id) };
}
