import { addInterval, calendarDay, compareDates } from '../../../lib/dates.js';
import { asRecord, idOrNull, nonEmptyTextOrNull, numberOrNull, textOrNull } from '../../../lib/payload.js';

export interface ImportCandidate {
  id: number;
  date: string;
  value: number;
  description: string | null;
  categoryId: number | null;
}

/** An Entry (or invoice item) already in Meu Dinheiro, as the matching reads it. */
export interface ExistingEntry {
  candidate: ImportCandidate;
  /** Status `conciliado`. The web hides it from the candidates and links it only on the same day. */
  reconciled: boolean;
  ndocumento: string | null;
}

interface BankSide {
  date: string | null;
  value: number | null;
  ndocumento: string | null;
}

/**
 * The rows that carry an id, a value, and a date, in date order (the web's `z`). A checking account
 * dates an Entry by `dataEfetiva`, then `dataPrevista`; a card dates an invoice item by `dataCompetencia`.
 */
export function readExisting(rows: readonly unknown[], source: 'entry' | 'invoice'): ExistingEntry[] {
  const existing: ExistingEntry[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record === null) continue;
    const id = idOrNull(record.id);
    const value = numberOrNull(record.valor);
    const date = source === 'invoice' ? calendarDay(record.dataCompetencia) : entryDate(record);
    if (id === null || value === null || date === null) continue;
    existing.push({
      candidate: { id, date, value, description: textOrNull(record.descricao), categoryId: idOrNull(record.categoria) },
      reconciled: record.status === 'conciliado',
      ndocumento: nonEmptyTextOrNull(record.ndocumento),
    });
  }
  // Stable, like Array.prototype.sort in the web: same-day Entries keep the API order.
  return existing.sort((a, b) => compareDates(a.candidate.date, b.candidate.date));
}

/**
 * Same signed value, Reconciled Entries included. A document number never drops one: the web
 * only uses it to link the same number first.
 */
export function candidatesFor(bank: BankSide, existing: readonly ExistingEntry[]): ExistingEntry[] {
  return existing.filter((item) => item.candidate.value === bank.value);
}

/** The web's day shifts (`conciliarAutomaticamente` default: up to 2 days), in its order. */
const SHIFTS = [0, 1, -1, 2, -2];

/**
 * The Entry the web links to each Bank Transaction on its own (mdb.js `rt`), row for row with `banks`.
 * For each shift, each Entry not used yet looks up the Bank Transactions on its date plus the shift
 * with its value (first also with its document number, then without) and takes the first one not
 * linked yet. A Reconciled Entry links only with shift 0; on another shift it is used up unlinked.
 */
export function automaticLinks(banks: readonly BankSide[], existing: readonly ExistingEntry[]): (number | null)[] {
  const linked: (number | null)[] = banks.map(() => null);
  const withDocument = new Map<string, number[]>();
  const withoutDocument = new Map<string, number[]>();
  banks.forEach((bank, index) => {
    if (bank.date === null || bank.value === null) return;
    const key = `${bank.date}_${bank.value}`;
    push(withoutDocument, key, index);
    if (bank.ndocumento !== null) push(withDocument, `${key}_${bank.ndocumento}`, index);
  });

  let left = [...existing];
  const pass = (shift: number, byDocument: boolean): void => {
    left = left.filter((item) => {
      const day = addInterval(item.candidate.date, shift, 'd');
      const key = byDocument ? `${day}_${item.candidate.value}_${item.ndocumento}` : `${day}_${item.candidate.value}`;
      const indexes = (byDocument ? withDocument : withoutDocument).get(key);
      if (indexes === undefined) return true;
      if (item.reconciled && shift !== 0) return false;
      const free = indexes.find((index) => linked[index] === null);
      if (free === undefined) return true;
      linked[free] = item.candidate.id;
      return false;
    });
  };
  for (const shift of SHIFTS) {
    if (left.length === 0) break;
    pass(shift, true);
    pass(shift, false);
  }
  return linked;
}

function push(map: Map<string, number[]>, key: string, index: number): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [index]);
  else list.push(index);
}

/** Effective date when it is a calendar day; otherwise the planned date. `data` is not a fallback. */
function entryDate(record: Record<string, unknown>): string | null {
  const effective = calendarDay(record.dataEfetiva);
  if (effective !== null) return effective;
  return calendarDay(record.dataPrevista);
}
