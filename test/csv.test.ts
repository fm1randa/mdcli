import { describe, expect, test } from 'bun:test';
import { toCsv } from '../src/lib/csv.js';

describe('toCsv', () => {
  test('joins header and rows with CRLF and a trailing newline', () => {
    expect(toCsv(['a', 'b'], [[1, 2], [3, 4]])).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  test('quotes fields that contain commas, quotes, or newlines', () => {
    expect(toCsv(['name', 'note'], [['Café, "especial"', 'line1\nline2']])).toBe(
      'name,note\r\n"Café, ""especial""","line1\nline2"\r\n'
    );
  });

  test('quotes fields with leading or trailing whitespace', () => {
    expect(toCsv(['x'], [[' padded ']])).toBe('x\r\n" padded "\r\n');
  });

  test('turns null and undefined into empty fields', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0\r\n');
  });

  test('leaves plain strings unquoted', () => {
    expect(toCsv(['id', 'name'], [[10, 'Mercado']])).toBe('id,name\r\n10,Mercado\r\n');
  });
});
