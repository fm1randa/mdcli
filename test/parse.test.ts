import { describe, expect, test } from 'bun:test';
import { parseAmount, parseId, parseInteger } from '../src/utils/parse.js';

// Jardinagem 2026-10-19: Number() turned '' and ' ' into 0, '1e3' into 1000,
// '0x10' into 16 and let 'Infinity' through.
describe('parseId', () => {
  const refused = ['', ' ', '1e3', '0x10', 'Infinity', '-1', '1.5', '0', ' 7', '7 ', '+7', '1_000', 'abc', '9007199254740993'];
  for (const input of refused) {
    test(`refuses ${JSON.stringify(input)}`, () => {
      expect(parseId(input)).toBeUndefined();
    });
  }

  test('accepts plain positive integers', () => {
    expect(parseId('1')).toBe(1);
    expect(parseId('1167419')).toBe(1167419);
    expect(parseId('007')).toBe(7);
  });
});

describe('parseInteger', () => {
  test('accepts 0 by default and enforces min', () => {
    expect(parseInteger('0')).toBe(0);
    expect(parseInteger('15')).toBe(15);
    expect(parseInteger('1', 2)).toBeUndefined();
    expect(parseInteger('2', 2)).toBe(2);
    expect(parseInteger('')).toBeUndefined();
    expect(parseInteger('2.0')).toBeUndefined();
  });
});

describe('parseAmount', () => {
  const refused = ['', ' ', '1e3', '0x10', 'Infinity', '-Infinity', 'NaN', '1.234,56', '1,234.56', '1.', '1,', '--1', '1 0', 'R$ 10', ' 10'];
  for (const input of refused) {
    test(`refuses ${JSON.stringify(input)}`, () => {
      expect(parseAmount(input)).toBeUndefined();
    });
  }

  const accepted: Array<[string, number]> = [
    ['10', 10],
    ['0', 0],
    ['42.9', 42.9],
    ['1,50', 1.5],
    ['-12.5', -12.5],
    ['+3', 3],
    ['.5', 0.5],
    [',75', 0.75],
    ['1234.56', 1234.56],
  ];
  for (const [input, expected] of accepted) {
    test(`reads ${JSON.stringify(input)} as ${expected}`, () => {
      expect(parseAmount(input)).toBe(expected);
    });
  }
});
