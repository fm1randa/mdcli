import { describe, expect, test } from 'bun:test';
import { asEntryId, asEntryIdText, asOccurrenceId } from '../src/lib/entry-id-brands.js';

describe('asEntryId', () => {
  test('brands a positive integer the API answered as a number or a decimal string', () => {
    expect(asEntryId(9)).toBe(9);
    expect(asEntryId('9')).toBe(9);
  });

  test('refuses zero, negatives, fractions, unsafe integers and non-numbers', () => {
    for (const id of [0, -3, 1.5, 2 ** 53, Number.NaN, '0', '-3', '1.5', '', 'x', null, undefined]) {
      expect(asEntryId(id)).toBeUndefined();
    }
  });
});

describe('asEntryIdText', () => {
  test('keeps a positive decimal string as it came', () => {
    expect(asEntryIdText('9')).toBe('9');
  });

  test('refuses zero, signs, non-digits and numbers', () => {
    for (const id of ['0', '-3', '+3', '1.5', '', '12A2026-01-05', 9]) {
      expect(asEntryIdText(id)).toBeUndefined();
    }
  });
});

describe('asOccurrenceId', () => {
  test('brands "<series>A<date>"', () => {
    expect(asOccurrenceId('1234567A2026-10-20')).toBe('1234567A2026-10-20');
  });

  test('refuses an entry ID, a bare date and a malformed date', () => {
    for (const id of ['1234567', 'A2026-10-20', '1234567A2026-1-20', '1234567a2026-10-20', 1234567]) {
      expect(asOccurrenceId(id)).toBeUndefined();
    }
  });
});
