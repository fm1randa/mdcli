const REGIME_CODES = { cash: 'ca', accrual: 'co' } as const;

/** The CLI name of an accounting regime. Issue #283 uses these same names. */
export type Regime = keyof typeof REGIME_CODES;

/** The API code of a regime (`regime=ca|co`). */
export function regimeCode(regime: Regime): (typeof REGIME_CODES)[Regime] {
  return REGIME_CODES[regime];
}

/** `cash` or `accrual`, ignoring case. Anything else is null and the command words the error. */
export function parseRegime(input: string): Regime | null {
  const name = input.toLowerCase();
  return name === 'cash' || name === 'accrual' ? name : null;
}
