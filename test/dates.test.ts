import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import {
  getCurrentMonthRange,
  isCalendarDate,
  shiftDueDate,
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

describe('getCurrentMonthRange', () => {
  afterEach(() => {
    setSystemTime(); // restore real clock
  });

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
