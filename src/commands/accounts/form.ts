/**
 * The fields of the web "Nova conta" / "Editar conta" form
 * (EditarContaController) that create and update share.
 */
import { exitWithError } from '../../utils/action.js';
import { parseAmount } from '../../utils/parse.js';
import { addInterval, isCalendarDate, today } from '../../lib/dates.js';
import type { AccountMeta } from '../../types/index.js';

type AccountType = AccountMeta['tipos'][number];

// "Considerar saldo" (the web's liquidezConta filter): 0 Imobilizado, 1 Disponível, 2 No futuro.
const LIQUIDITY = new Map([
  ['fixed', 0], ['available', 1], ['future', 2], ['0', 0], ['1', 1], ['2', 2],
]);

/**
 * The account's liquidez from --liquidity, or `fallback` without it. The web
 * has no "Considerar saldo" field for a type with a grupobp (cards), so the
 * option is refused there.
 */
export function resolveLiquidity<T extends number | undefined>(
  input: string | undefined,
  type: AccountType | undefined,
  fallback: T
): number | T {
  if (input === undefined) return fallback;
  if (type?.grupobp) {
    exitWithError(`--liquidity does not apply to the account type "${type.nome}" (the web has no "Considerar saldo" field for it).`);
  }
  const liquidity = LIQUIDITY.get(input);
  if (liquidity === undefined) {
    exitWithError(`Invalid liquidity "${input}". Use available (1), future (2) or fixed (0).`);
  }
  return liquidity;
}

/** The initial balance date from --balance-date (YYYY-MM-DD), or `fallback` without it. */
export function resolveBalanceDate<T>(input: string | undefined, fallback: T): string | T {
  if (input === undefined) return fallback;
  if (!isCalendarDate(input)) {
    exitWithError(`Invalid balance date "${input}". Use YYYY-MM-DD.`);
  }
  return input;
}

/** Yesterday's local calendar day: the web's default initial balance date. */
export function defaultBalanceDate(): string {
  return addInterval(today(), -1, 'd');
}

interface SignedBalanceOptions {
  balance?: string;
  debtor?: boolean;
  creditor?: boolean;
}

/**
 * saldoInicial the way the web saves it: |balance| * sign, the sign from the
 * Credor/Devedor radio. An explicit --debtor/--creditor wins, then a negative
 * --balance, then `stored` (the existing balance, whose sign the web pre-sets
 * the radio from; 0 on create). Without --balance the magnitude of `stored` is
 * kept.
 */
export function resolveSignedBalance(options: SignedBalanceOptions, stored: number): number {
  if (options.debtor && options.creditor) {
    exitWithError('Cannot use --debtor and --creditor together.');
  }
  let balance = stored;
  if (options.balance !== undefined) {
    const parsed = parseAmount(options.balance);
    if (parsed === undefined) {
      exitWithError('Invalid balance. Must be a number.');
    }
    if (parsed < 0 && options.creditor) {
      exitWithError('A negative --balance cannot be used with --creditor.');
    }
    balance = parsed;
  }
  let sign = balance < 0 || stored < 0 ? -1 : 1;
  if (options.debtor) sign = -1;
  if (options.creditor) sign = 1;
  const signed = Math.abs(balance) * sign;
  return signed === 0 ? 0 : signed;
}
