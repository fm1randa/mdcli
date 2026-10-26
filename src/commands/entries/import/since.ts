import { addInterval, calendarDay, isCalendarDate, today } from '../../../lib/dates.js';
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
export function earliestSince(day = today()): string {
  return addInterval(day, -90, 'd');
}

/**
 * The web's default start date in the import dialog: the account's last statement date
 * (`dataUltimoExtrato`), but no earlier than 90 days ago.
 */
export function defaultSince(lastStatement: unknown, day = today()): string {
  const floor = earliestSince(day);
  const statementDay = calendarDay(lastStatement);
  return statementDay !== null && statementDay > floor ? statementDay : floor;
}

/** A YYYY-MM-DD the user typed, or undefined when --since was omitted. Rejects dates outside the web app's window. */
export function explicitSince(typed: string | undefined, day = today()): string | undefined {
  const input = calendarDateFlag(typed);
  if (input === undefined) return undefined;
  const floor = earliestSince(day);
  if (input < floor) {
    exitWithError(`The earliest start date is ${floor}. Bank transactions can only be loaded for the last 90 days.`);
  }
  if (input > day) {
    exitWithError(`The latest start date is today (${day}).`);
  }
  return input;
}
