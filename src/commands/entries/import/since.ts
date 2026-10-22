import { addInterval, isCalendarDate, toLocalDateString } from '../../../lib/dates.js';
import { exitWithError } from '../../../utils/action.js';

/** A calendar date flag (YYYY-MM-DD) as typed, undefined when omitted, or exit when it is not a real day. */
export function calendarDateFlag(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (!isCalendarDate(input)) {
    exitWithError(`Invalid date "${input}". Use YYYY-MM-DD (e.g., 2026-10-03).`);
  }
  return input;
}

/** A YYYY-MM-DD the user typed, or undefined when --since was omitted. Rejects dates outside the web app's window. */
export function explicitSince(typed: string | undefined, now = new Date()): string | undefined {
  const input = calendarDateFlag(typed);
  if (input === undefined) return undefined;
  const today = toLocalDateString(now);
  const floor = addInterval(today, -90, 'd');
  if (input < floor) {
    exitWithError(`The earliest start date is ${floor}. Bank transactions can only be loaded for the last 90 days.`);
  }
  if (input > today) {
    exitWithError(`The latest start date is today (${today}).`);
  }
  return input;
}

/**
 * Later of the account's last statement date and the local day 90 days ago.
 * Only a YYYY-MM-DD value counts; the connections payload does not carry this field.
 */
export function defaultSince(lastStatement: string | undefined, now = new Date()): string {
  const today = toLocalDateString(now);
  const floor = addInterval(today, -90, 'd');
  if (lastStatement !== undefined && isCalendarDate(lastStatement) && lastStatement > floor) {
    return lastStatement;
  }
  return floor;
}
