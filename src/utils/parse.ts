/**
 * Strict parsing of numbers typed by the user. Number() is too lenient for
 * CLI input: Number('') and Number(' ') are 0, '1e3' is 1000, '0x10' is 16
 * and 'Infinity' passes, so `entries create -v ""` created an R$ 0 entry.
 * Command code goes through these helpers (an ESLint rule bans Number(...)
 * in src/commands).
 */

const DIGITS = /^\d+$/;

/** A whole number written in plain decimal digits, at least `min`. */
export function parseInteger(input: string, min = 0): number | undefined {
  if (!DIGITS.test(input)) return undefined;
  const value = Number.parseInt(input, 10);
  return Number.isSafeInteger(value) && value >= min ? value : undefined;
}

/** An API ID: a positive integer in plain decimal digits. */
export function parseId(input: string): number | undefined {
  return parseInteger(input, 1);
}

// 12, -12, 12.5, .5 and the Brazilian decimal comma 12,5 (no thousands separators).
const AMOUNT = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/;

/**
 * A money amount: an optional sign, digits and an optional decimal part with
 * a dot or a comma ("1,50" is 1.5, as typed in Brazil). Refuses empty input,
 * exponents, hex, Infinity and thousands separators ("1.234,56").
 */
export function parseAmount(input: string): number | undefined {
  if (!AMOUNT.test(input)) return undefined;
  const value = Number.parseFloat(input.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}
