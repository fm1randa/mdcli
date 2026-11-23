import { isPositiveSafeInteger, parseId } from '../utils/parse.js';
import type { EntryId, EntryIdText, OccurrenceId } from '../types/index.js';

// The only module that brands a value as an entry or occurrence ID:
// `local/no-brand-cast` refuses `as EntryId` and its kin everywhere else (#277).

/**
 * What POST /v1/lancamentos answered for a card purchase (Real use,
 * 2026-10-16): "<series>A<date>", e.g. "1234567A2026-10-20". It is not an
 * entry ID: GET/PUT/DELETE /v1/lancamentos/:id need the numeric one.
 */
const OCCURRENCE_ID = /^\d+A\d{4}-\d{2}-\d{2}$/;

/** The numeric entry ID in a value the API answered, if it is one: a positive safe integer. */
export function asEntryId(id: unknown): EntryId | undefined {
  if (isPositiveSafeInteger(id)) return id as EntryId;
  if (typeof id !== 'string') return undefined;
  const entryId = parseId(id);
  return entryId === undefined ? undefined : (entryId as EntryId);
}

/** An entry ID the API answered as a decimal string of a positive integer, kept as it came. */
export function asEntryIdText(id: unknown): EntryIdText | undefined {
  return typeof id === 'string' && parseId(id) !== undefined ? (id as EntryIdText) : undefined;
}

/** The occurrence ID the API answers for a card purchase or a future pending entry, if it is one. */
export function asOccurrenceId(id: unknown): OccurrenceId | undefined {
  return typeof id === 'string' && OCCURRENCE_ID.test(id) ? (id as OccurrenceId) : undefined;
}

/**
 * The ID POST answered when it is not an entry ID, kept as it came. A card
 * purchase can answer anything (#78), and `entries create` prints it as the
 * occurrence ID it stands for, so this one brand has no shape to check.
 */
export function answeredOccurrenceId(id: number | string): OccurrenceId {
  return id as OccurrenceId;
}
