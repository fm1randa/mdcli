import chalk from 'chalk';

// The only place that formats money: an ESLint rule bans
// toLocaleString(..., { style: 'currency' }) elsewhere (Jardinagem 2026-10-19).
function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function colored(value: number, text: string): string {
  return value >= 0 ? chalk.green(text) : chalk.red(text);
}

/** R$ with its sign (-R$ 12,50), green when >= 0 and red otherwise. */
export function formatCurrency(value: number): string {
  return colored(value, brl(value));
}

/**
 * R$ without the sign, colored by it. Only where the magnitude is the point:
 * the Income and Expenses columns of entries summary.
 */
export function formatMagnitude(value: number): string {
  return colored(value, brl(Math.abs(value)));
}

/**
 * Whole cents of the value's magnitude, the unit to compare or split money
 * in: 0.1 + 0.2 is 30 cents, not 0.30000000000000004 (Jardinagem 2026-10-21).
 */
export function toCents(value: number): number {
  return Math.round(Math.abs(value) * 100);
}
