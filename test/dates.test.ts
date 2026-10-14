import { describe, expect, test } from 'bun:test';
import {
  getDefaultDateRange,
  getMonthRange,
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

describe('getDefaultDateRange / getMonthRange', () => {
  test('both report the same current calendar month', () => {
    const defaultRange = getDefaultDateRange();
    const monthRange = getMonthRange();
    expect(defaultRange.startDate).toBe(monthRange.start);
    expect(defaultRange.endDate).toBe(monthRange.end);

    const now = new Date();
    const expectedStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const expectedEnd = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    expect(defaultRange.startDate).toBe(expectedStart);
    expect(defaultRange.endDate).toBe(expectedEnd);
  });
});
