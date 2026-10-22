import { addInterval, isCalendarDate } from '../../../lib/dates.js';
import { asRecord, idOrNull, numberOrNull, textOrNull } from './read.js';

export interface ImportCandidate {
  id: number;
  date: string;
  value: number;
  description: string | null;
  categoryId: number | null;
}

interface BankSide {
  date: string | null;
  value: number | null;
  ndocumento: string | null;
}

/** Same signed value inside the window. `automatic` counts the entries also within 2 calendar days. */
export function candidatesFor(
  bank: BankSide,
  rows: readonly unknown[],
  window: { from: string; to: string },
  source: 'entry' | 'invoice',
): { candidates: ImportCandidate[]; automatic: number } {
  const candidates: ImportCandidate[] = [];
  let automatic = 0;
  for (const row of rows) {
    const record = asRecord(row);
    const candidate = record === null ? null : readCandidate(record, source);
    if (candidate === null || record === null) continue;
    if (candidate.value !== bank.value) continue;
    if (candidate.date < window.from || candidate.date > window.to) continue;
    if (documentsDiffer(bank.ndocumento, record.ndocumento)) continue;
    candidates.push(candidate);
    if (bank.date !== null && isCalendarDate(bank.date) && withinTwoDays(bank.date, candidate.date)) {
      automatic += 1;
    }
  }
  return { candidates, automatic };
}

function readCandidate(record: Record<string, unknown>, source: 'entry' | 'invoice'): ImportCandidate | null {
  const id = idOrNull(record.id);
  const value = numberOrNull(record.valor);
  const date = source === 'invoice' ? calendarDay(record.data) : entryDate(record);
  if (id === null || value === null || date === null) return null;
  return {
    id,
    date,
    value,
    description: textOrNull(record.descricao),
    categoryId: idOrNull(record.categoria),
  };
}

/** Effective date when it is a calendar day; otherwise the planned date. `data` is not a fallback. */
function entryDate(record: Record<string, unknown>): string | null {
  const effective = calendarDay(record.dataEfetiva);
  if (effective !== null) return effective;
  return calendarDay(record.dataPrevista);
}

/** The API sends `YYYY-MM-DD` or `YYYY-MM-DDT00:00:00`; only the calendar day counts. */
function calendarDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return isCalendarDate(day) ? day : null;
}

/** Differing document numbers drop the entry. A missing or empty number on either side does not. */
function documentsDiffer(bank: string | null, entry: unknown): boolean {
  if (bank === null || bank === '') return false;
  if (typeof entry !== 'string' || entry === '') return false;
  return bank !== entry;
}

function withinTwoDays(bankDate: string, entryDate: string): boolean {
  return entryDate >= addInterval(bankDate, -2, 'd') && entryDate <= addInterval(bankDate, 2, 'd');
}
