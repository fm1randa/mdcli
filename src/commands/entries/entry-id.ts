import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { parseId } from '../../utils/parse.js';
import { answeredOccurrenceId, asEntryId, asEntryIdText, asOccurrenceId } from '../../lib/entry-id-brands.js';
import { fetchAllEntries } from '../../lib/api.js';
import { toCents } from '../../utils/currency.js';
import { shiftDueDate } from '../../lib/dates.js';
import type { CreateEntryResponse, EntryId, EntryIdText, OccurrenceId } from '../../types/index.js';

/** The numeric entry ID from a CLI argument, or exit with a hint. */
export function parseEntryId(id: string): number {
  const entryId = parseId(id);
  if (entryId !== undefined) return entryId;
  if (asOccurrenceId(id) !== undefined) {
    exitWithError(t('errorSeriesOccurrenceId', id));
  }
  exitWithError(t('errorInvalidEntryId'));
}

/**
 * The answer of `entries create`: the raw response once its ID is resolved.
 * Splitting the two types is what keeps a new create path from printing an
 * occurrence ID: only this type reaches stdout. The id stays two union members
 * rather than one union property, which is what makes a raw CreateEntryResponse
 * unassignable here.
 */
export type ResolvedCreateEntry = Omit<CreateEntryResponse, 'id'> &
  (
    | { id: EntryId | EntryIdText; occurrenceId?: OccurrenceId }
    | { id: OccurrenceId; occurrenceId?: OccurrenceId }
  );

/** Where the numeric ID of a created entry can be found when POST answers an occurrence ID. */
export interface CreatedEntryLookup {
  /**
   * Whether an ID that is neither an entry ID nor an occurrence is looked up
   * too. A card purchase can answer anything; a future pending entry answers
   * an occurrence ID or nothing to look up.
   */
  looksUpAnyId: boolean;
  /** IDs of the entries the source lists for this create, or none. */
  find: () => Promise<EntryId[]>;
  /** stderr warning when find answers none. */
  notFound: (id: string) => string;
}

/**
 * The one place `entries create` turns the ID the API answered into the ID the
 * next command accepts (#78, #166). An ID that is already an entry's comes back
 * untouched, number or decimal string. An occurrence ID is looked up where the
 * created entry lands (the card invoice or the entries list) and kept in
 * occurrenceId. When the lookup finds nothing the API's ID stays, without
 * occurrenceId, and a warning goes to stderr, so stdout stays valid JSON.
 */
export async function resolveCreatedEntryId(
  response: CreateEntryResponse,
  lookup: CreatedEntryLookup
): Promise<ResolvedCreateEntry> {
  const rawId: unknown = response.id;
  const entryId = typeof rawId === 'number' ? asEntryId(rawId) : asEntryIdText(rawId);
  if (entryId !== undefined) return { ...response, id: entryId };
  const occurrenceId = answeredOccurrenceId(rawId);
  if (asOccurrenceId(rawId) !== undefined || lookup.looksUpAnyId) {
    const ids = await lookup.find();
    if (ids.length === 0) {
      console.error(lookup.notFound(String(rawId)));
      return { ...response, id: occurrenceId };
    }
    return { ...response, id: ids.reduce((max, id) => (id > max ? id : max)), occurrenceId };
  }
  return { ...response, id: occurrenceId };
}

/**
 * Where a future pending entry on a regular account shows up: POST answers the
 * same occurrence ID a card purchase does ("<agenda>A<date>", #165), while the
 * numeric ID only appears in the entries list. Match the created entry there
 * (account, description, value and planned date).
 */
export function scheduledEntryLookup(scheduled: {
  accountId: number;
  date: string;
  description: string;
  value: number;
}): CreatedEntryLookup {
  return {
    looksUpAnyId: false,
    find: async () => {
      // The list's date range filters on dataPrevista (normalize.ts), so one
      // month around the planned date covers the entry wherever its `data`
      // falls. Day 31 clamps to the month's last day (31 -> Feb 28).
      const month = scheduled.date.slice(0, 7);
      const entries = await fetchAllEntries({
        accountIds: [scheduled.accountId],
        startDate: `${month}-01`,
        endDate: shiftDueDate(`${month}-31`, 0),
      });
      return entries
        .filter(
          (e) =>
            e.descricao === scheduled.description &&
            toCents(e.valor) === toCents(scheduled.value) &&
            e.dataPrevista?.slice(0, 10) === scheduled.date
        )
        .flatMap((e) => {
          const id = asEntryId(e.id);
          return id === undefined ? [] : [id];
        });
    },
    notFound: (id) => t('warningScheduledEntryIdNotFound', id, scheduled.accountId),
  };
}
