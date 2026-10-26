import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import {
  addInterval,
  getCurrentMonthRange,
  isCalendarDate,
  shiftDueDate,
  today,
  toLocalDateString,
} from '../src/lib/dates.js';

describe('toLocalDateString', () => {
  test('formats local calendar parts as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('shiftDueDate', () => {
  test('shifts by whole months without changing the day when it fits', () => {
    expect(shiftDueDate('2026-01-15', 1)).toBe('2026-02-15');
    expect(shiftDueDate('2026-01-15', -1)).toBe('2025-12-15');
    expect(shiftDueDate('2026-01-15', 0)).toBe('2026-01-15');
  });

  test('clamps the day to the last day of the target month', () => {
    expect(shiftDueDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftDueDate('2024-01-31', 1)).toBe('2024-02-29');
    expect(shiftDueDate('2026-03-31', 1)).toBe('2026-04-30');
    expect(shiftDueDate('2026-05-31', -1)).toBe('2026-04-30');
  });
});

describe('isCalendarDate', () => {
  test('accepts real YYYY-MM-DD calendar days', () => {
    expect(isCalendarDate('2026-01-15')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-12-31')).toBe(true);
  });

  test('rejects malformed strings and impossible calendar days', () => {
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-04-31')).toBe(false);
    expect(isCalendarDate('2025-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-00-10')).toBe(false);
    expect(isCalendarDate('2026-1-5')).toBe(false);
    expect(isCalendarDate('not-a-date')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
  });
});

/**
 * Runs each test of the block with MDCLI_TODAY as given (undefined unsets it)
 * and a clock the test may pin with setSystemTime, restoring the run's
 * MDCLI_TODAY and the real clock after each test.
 */
function withClockAndPinnedDay(value: string | undefined): void {
  const saved = process.env.MDCLI_TODAY;
  beforeEach(() => {
    if (value === undefined) delete process.env.MDCLI_TODAY;
    else process.env.MDCLI_TODAY = value;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.MDCLI_TODAY;
    else process.env.MDCLI_TODAY = saved;
    setSystemTime(); // restore real clock
  });
}

describe('getCurrentMonthRange', () => {
  withClockAndPinnedDay(undefined);

  test('returns first and last day for a mid-month leap February', () => {
    setSystemTime(new Date(2024, 1, 10)); // 2024-02-10 local
    expect(getCurrentMonthRange()).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });
  });

  test('returns first and last day for the last day of December', () => {
    setSystemTime(new Date(2026, 11, 31)); // 2026-12-31 local
    expect(getCurrentMonthRange()).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
  });
});

describe('today', () => {
  describe('without MDCLI_TODAY', () => {
    withClockAndPinnedDay(undefined);

    test('is the local calendar day of the clock, not the UTC one', () => {
      // In the suite's zone (Pacific/Kiritimati, UTC+14) 08:00 local is still the day before in UTC.
      setSystemTime(new Date(2027, 0, 1, 8, 0));
      expect(today()).toBe('2027-01-01');
    });
  });

  describe('with MDCLI_TODAY', () => {
    withClockAndPinnedDay('2027-03-01');

    test('is the pinned day, whatever the clock says', () => {
      setSystemTime(new Date(2026, 9, 26, 23, 59));
      expect(today()).toBe('2027-03-01');
    });

    test('moves getCurrentMonthRange with it', () => {
      expect(getCurrentMonthRange()).toEqual({ startDate: '2027-03-01', endDate: '2027-03-31' });
    });

    test('rejects a value that is not a calendar day', () => {
      process.env.MDCLI_TODAY = '2027-02-30';
      expect(() => today()).toThrow('MDCLI_TODAY must be a YYYY-MM-DD calendar day, got "2027-02-30"');
    });
  });
});

describe('addInterval', () => {
  test('clamps months and years to the end of the target month', () => {
    expect(addInterval('2026-01-31', 1, 'M')).toBe('2026-02-28');
    expect(addInterval('2024-02-29', 1, 'y')).toBe('2025-02-28');
  });

  test('adds days and weeks across month and year boundaries', () => {
    expect(addInterval('2026-12-30', 3, 'd')).toBe('2027-01-02');
    expect(addInterval('2026-02-20', 2, 'w')).toBe('2026-03-06');
  });
});
