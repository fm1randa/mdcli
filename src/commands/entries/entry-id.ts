import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { parseId, parseInteger } from '../../utils/parse.js';
import { fetchAllEntries } from '../../lib/api.js';
import { toCents } from '../../utils/currency.js';
import { shiftDueDate } from '../../lib/dates.js';
import type { CreateEntryResponse, EntryId, OccurrenceId } from '../../types/index.js';

/**
 * What POST /v1/lancamentos answered for a card purchase (Finanças,
 * 2026-10-16): "<series>A<date>", e.g. "46349170A2026-10-20". It is not an
 * entry ID: GET/PUT/DELETE /v1/lancamentos/:id need the numeric one.
 */
const OCCURRENCE_ID = /^\d+A\d{4}-\d{2}-\d{2}$/;

/** The numeric entry ID in a value the API answered, if it is one. */
export function asEntryId(id: unknown): EntryId | undefined {
  if (typeof id === 'number') return Number.isInteger(id) ? (id as EntryId) : undefined;
  if (typeof id !== 'string') return undefined;
  const entryId = parseInteger(id);
  return entryId === undefined ? undefined : (entryId as EntryId);
}

/** True for the occurrence ID the API answers for a card purchase or a future pending entry. */
function isOccurrenceId(id: unknown): id is OccurrenceId {
  return typeof id === 'string' && OCCURRENCE_ID.test(id);
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
 * The answer of `entries create`: the raw response once its ID is resolved.
 * Splitting the two types is what keeps a new create path from printing an
 * occurrence ID: only this type reaches stdout.
 */
export type ResolvedCreateEntry = Omit<CreateEntryResponse, 'id'> &
  (
    | { id: EntryId; occurrenceId?: OccurrenceId }
    | { id: OccurrenceId; occurrenceId: OccurrenceId }
  );

/** Where the numeric ID of a created entry can be found when POST answers an occurrence ID. */
export interface CreatedEntryLookup {
  /** IDs of the entries the source lists for this create, or none. */
  find: () => Promise<EntryId[]>;
  /** stderr warning when find answers none. */
  notFound: (occurrenceId: OccurrenceId) => string;
}

/**
 * The one place `entries create` turns the ID the API answered into the ID the
 * next command accepts (#78, #166). A numeric ID already is the entry's. An
 * occurrence ID is looked up where the created entry lands (the card invoice
 * or the entries list) and kept in occurrenceId. When the lookup finds nothing
 * the API's ID stays and a warning goes to stderr, so stdout stays valid JSON.
 */
export async function resolveCreatedEntryId(
  response: CreateEntryResponse,
  lookup: CreatedEntryLookup
): Promise<ResolvedCreateEntry> {
  const entryId = asEntryId(response.id);
  if (entryId !== undefined) return { ...response, id: entryId };
  // Only an occurrence ID needs resolving. Anything else is already the
  // entry's ID, so leave it untouched (the old resolvers were as lenient).
  if (!isOccurrenceId(response.id)) return { ...response, id: response.id };
  const occurrenceId = response.id;
  const ids = await lookup.find();
  if (ids.length === 0) {
    console.error(lookup.notFound(occurrenceId));
    return { ...response, id: occurrenceId, occurrenceId };
  }
  return { ...response, id: Math.max(...ids) as EntryId, occurrenceId };
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
    notFound: (occurrenceId) =>
      t('warningScheduledEntryIdNotFound', String(occurrenceId), scheduled.accountId),
  };
}
