import { addInterval, calendarDay, isCalendarDate, toLocalDateString } from '../../../lib/dates.js';
import { exitWithError } from '../../../utils/action.js';

/** A calendar date flag (YYYY-MM-DD) as typed, undefined when omitted, or exit when it is not a real day. */
export function calendarDateFlag(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (!isCalendarDate(input)) {
    exitWithError(`Invalid date "${input}". Use YYYY-MM-DD (e.g., 2026-10-03).`);
  }
  return input;
}

/** The earliest start date the web's import dialog accepts: 90 days ago. */
export function earliestSince(now = new Date()): string {
  return addInterval(toLocalDateString(now), -90, 'd');
}

/**
 * The web's default start date in the import dialog: the account's last statement date
 * (`dataUltimoExtrato`), but no earlier than 90 days ago.
 */
export function defaultSince(lastStatement: unknown, now = new Date()): string {
  const floor = earliestSince(now);
  const day = calendarDay(lastStatement);
  return day !== null && day > floor ? day : floor;
}

/** A YYYY-MM-DD the user typed, or undefined when --since was omitted. Rejects dates outside the web app's window. */
export function explicitSince(typed: string | undefined, now = new Date()): string | undefined {
  const input = calendarDateFlag(typed);
  if (input === undefined) return undefined;
  const today = toLocalDateString(now);
  const floor = earliestSince(now);
  if (input < floor) {
    exitWithError(`The earliest start date is ${floor}. Bank transactions can only be loaded for the last 90 days.`);
  }
  if (input > today) {
    exitWithError(`The latest start date is today (${today}).`);
  }
  return input;
}
