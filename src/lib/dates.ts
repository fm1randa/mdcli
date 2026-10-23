export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** First and last calendar day of the current local month. */
export function getCurrentMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: toLocalDateString(startDate),
    endDate: toLocalDateString(endDate),
  };
}

/** Shifts a YYYY-MM-DD due date by whole months, clamping the day. */
export function shiftDueDate(dueDate: string, months: number): string {
  const [year, month, day] = dueDate.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toLocalDateString(target);
}

const INVOICE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Validates a YYYY-MM invoice month (month 01-12); throws a message for the user otherwise. */
export function parseInvoiceMonth(value: string): string {
  if (!INVOICE_MONTH.test(value)) {
    throw new Error(`Invalid invoice month "${value}". Use YYYY-MM with a month from 01 to 12 (e.g., 2026-10)`);
  }
  return value;
}

/**
 * Due date of a card's invoice in a YYYY-MM month, from any of its due dates
 * (proximoVencimento). Reads the day from the string: new Date('2026-11-16')
 * is UTC midnight, which is the 15th in Brazil (dogfood 2026-10-19). The day
 * is clamped (31 -> Feb 28).
 */
export function dueDateInMonth(month: string, anyDueDate: string): string {
  return shiftDueDate(`${parseInvoiceMonth(month)}-${anyDueDate.slice(8, 10)}`, 0);
}

/** Sort order of two YYYY-MM-DD dates (plain string order). */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** True for a real YYYY-MM-DD calendar day (rejects 2026-02-31). */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Moves a YYYY-MM-DD date by `count` days, weeks, months or years, the way
 * the web app (moment's add) does: months and years clamp the day to the end
 * of the target month, so Jan 31 + 1 month is Feb 28/29.
 */
export function addInterval(date: string, count: number, interval: 'd' | 'w' | 'M' | 'y'): string {
  if (interval === 'M') return shiftDueDate(date, count);
  if (interval === 'y') return shiftDueDate(date, count * 12);
  const [year, month, day] = date.split('-').map(Number);
  const days = interval === 'w' ? count * 7 : count;
  return toLocalDateString(new Date(year, month - 1, day + days));
}
