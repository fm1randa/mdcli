import { isCalendarDate } from '../../../lib/dates.js';
import { asRecord, idOrNull, numberOrNull } from './read.js';

type SuggestionKind = 'd' | 'r' | 't';

/** `d` for a negative value, `r` for a positive one, `t` when `_ca.st` is a transfer. Zero is neither. */
function suggestionKind(value: number | null, transfer: boolean): SuggestionKind | null {
  if (transfer) return 't';
  if (value !== null && value < 0) return 'd';
  if (value !== null && value > 0) return 'r';
  return null;
}

function fieldValue(ca: Record<string, unknown> | null, kind: SuggestionKind | null, field: string): unknown {
  if (ca === null || kind === null) return undefined;
  const groups = asRecord(ca.c);
  const bucket = asRecord(groups?.[kind]);
  const entry = asRecord(bucket?.[field]);
  return entry?.v;
}

interface LearnedFields {
  categoryId: number | null;
  suggestedDescription: string | null;
  suggestedTagIds: number[];
}

/** Category, description, and tag ids from `_ca.c[tipo]`, with `_ca.d` as the description fallback. */
export function learnedFields(row: unknown): LearnedFields {
  const record = asRecord(row);
  const ca = asRecord(record?._ca);
  const kind = suggestionKind(numberOrNull(record?.valor), ca?.st === true);
  const fromField = fieldValue(ca, kind, 'descricao');
  let suggestedDescription: string | null = null;
  if (typeof fromField === 'string') suggestedDescription = fromField;
  else if (ca !== null && typeof ca.d === 'string') suggestedDescription = ca.d;
  return {
    categoryId: idOrNull(fieldValue(ca, kind, 'categoria')),
    suggestedDescription,
    suggestedTagIds: kind === null ? [] : tagIds(fieldValue(ca, kind, 'tags')),
  };
}

export interface AiRequest {
  kind: SuggestionKind;
  token: unknown;
}

/** `_ca.ait[tipo]`, the token the web app sends to the AI, with the row's tipo. Null when there is none. */
export function aiRequest(row: unknown): AiRequest | null {
  const record = asRecord(row);
  const ca = asRecord(record?._ca);
  const kind = suggestionKind(numberOrNull(record?.valor), ca?.st === true);
  if (ca === null || kind === null) return null;
  const token = asRecord(ca.ait)?.[kind] ?? null;
  return token === null ? null : { kind, token };
}

/** Smallest and largest calendar dates on the loaded rows. No date means no duplicate lookup. */
export function loadedDateBounds(dates: readonly (string | null)[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const date of dates) {
    if (date === null || !isCalendarDate(date)) continue;
    if (start === null || date < start) start = date;
    if (end === null || date > end) end = date;
  }
  if (start === null || end === null) return null;
  return { start, end };
}

/** Id of the first entry with this date and value, or null when nothing pairs. */
export function duplicateId(date: string | null, value: number | null, payload: unknown): number | null {
  if (date === null || value === null) return null;
  const record = asRecord(payload);
  const rows = record?.[date];
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const item = asRecord(row);
    if (numberOrNull(item?.valor) !== value) continue;
    const id = idOrNull(item?.id);
    if (id !== null) return id;
  }
  return null;
}

function tagIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    const ids: number[] = [];
    for (const item of value) {
      const id = idOrNull(item);
      if (id !== null) ids.push(id);
    }
    return ids;
  }
  const id = idOrNull(value);
  return id === null ? [] : [id];
}

