import { describe, expect, test } from 'bun:test';
import { truncate } from '../src/utils/text.js';
import { toCents } from '../src/utils/currency.js';

describe('truncate', () => {
  test('keeps text that fits the column, ellipsis room included', () => {
    expect(truncate('Mercado', 12)).toBe('Mercado');
    expect(truncate('123456789', 12)).toBe('123456789');
  });

  test('cuts longer text to colWidth - 3 and ends it with "..."', () => {
    expect(truncate('1234567890', 12)).toBe('123456789...');
    expect(truncate('Assinatura anual do serviço', 12)).toBe('Assinatur...');
  });
});

describe('toCents', () => {
  test('rounds the magnitude to whole cents', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(-33.33)).toBe(3333);
    expect(toCents(100)).toBe(10000);
  });
});
