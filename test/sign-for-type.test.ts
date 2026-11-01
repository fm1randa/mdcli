import { describe, expect, test } from 'bun:test';
import { signForType } from '../src/commands/entries/type.js';

// PR #138 consolidated the web bundle sign rules (md.js / mdb.js:
// valor = (tipo != 'r' ? -1 : 1) * |valor|) into one function; the literal
// table below writes the expected sign as a literal, not computed, so it
// cannot be tautological.
describe('signForType literal table', () => {
  test('income (r) is positive', () => {
    expect(signForType('r')).toBe(1);
  });

  test('expense (d) is negative', () => {
    expect(signForType('d')).toBe(-1);
  });

  test('transfer (t) is negative', () => {
    expect(signForType('t')).toBe(-1);
  });

  test('invoice payment (p) keeps sign', () => {
    expect(signForType('p')).toBe(0);
  });

  test('unknown types default to negative', () => {
    expect(signForType('x')).toBe(-1);
  });
});
