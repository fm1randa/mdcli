/**
 * The fields of the web "Nova conta" / "Editar conta" form
 * (EditarContaController) that create and update share.
 */
import { exitWithError } from '../../utils/action.js';
import { parseAmount } from '../../utils/parse.js';
import { addInterval, isCalendarDate, today } from '../../lib/dates.js';

// "Considerar saldo" (the web's liquidezConta filter): 0 Imobilizado, 1 Disponível, 2 No futuro.
const LIQUIDITY = new Map([
  ['fixed', 0], ['available', 1], ['future', 2], ['0', 0], ['1', 1], ['2', 2],
]);

export interface AccountFormOptions {
  balance?: string;
  balanceDate?: string;
  debtor?: boolean;
  creditor?: boolean;
  liquidity?: string;
}

/** The form flags, validated before any request is made. */
export interface AccountForm {
  balance?: number;
  balanceDate?: string;
  liquidity?: number;
  debtor: boolean;
  creditor: boolean;
}

/** Validates the form flags that need no stored account or type. */
export function parseAccountForm(options: AccountFormOptions): AccountForm {
  if (options.debtor && options.creditor) {
    exitWithError('Cannot use --debtor and --creditor together.');
  }

  let balance: number | undefined;
  if (options.balance !== undefined) {
    balance = parseAmount(options.balance);
    if (balance === undefined) {
      exitWithError('Invalid balance. Must be a number.');
    }
    if (balance < 0 && options.creditor) {
      exitWithError('A negative --balance cannot be used with --creditor.');
    }
  }

  if (options.balanceDate !== undefined && !isCalendarDate(options.balanceDate)) {
    exitWithError(`Invalid balance date "${options.balanceDate}". Use YYYY-MM-DD.`);
  }

  let liquidity: number | undefined;
  if (options.liquidity !== undefined) {
    liquidity = LIQUIDITY.get(options.liquidity);
    if (liquidity === undefined) {
      exitWithError(`Invalid liquidity "${options.liquidity}". Use available (1), future (2) or fixed (0).`);
    }
  }

  return {
    balance,
    balanceDate: options.balanceDate,
    liquidity,
    debtor: !!options.debtor,
    creditor: !!options.creditor,
  };
}

/**
 * The --liquidity value, refused for a card: the web has no "Considerar saldo"
 * field for it.
 */
export function liquidityFor(form: AccountForm, isCard: boolean, typeName: string): number | undefined {
  if (form.liquidity !== undefined && isCard) {
    exitWithError(`--liquidity does not apply to the account type "${typeName}" (the web has no "Considerar saldo" field for it).`);
  }
  return form.liquidity;
}

/** Yesterday's local calendar day: the web's default initial balance date. */
export function defaultBalanceDate(): string {
  return addInterval(today(), -1, 'd');
}

/**
 * saldoInicial the way the web saves it: |balance| * sign, the sign from the
 * Credor/Devedor radio. An explicit --debtor/--creditor wins, then a negative
 * --balance, then `stored` (the existing balance, whose sign the web pre-sets
 * the radio from; 0 on create). Without --balance the magnitude of `stored` is
 * kept.
 */
export function signedBalance(form: AccountForm, stored: number): number {
  const balance = form.balance ?? stored;
  // --debtor on a zero balance would claim a sign 0 cannot carry. An explicit
  // --balance 0 is not that case: zeroing the balance is the change asked for.
  if (form.debtor && form.balance === undefined && balance === 0) {
    exitWithError('--debtor has no effect on a zero balance. Pass a nonzero --balance.');
  }
  let sign = balance < 0 || stored < 0 ? -1 : 1;
  if (form.debtor) sign = -1;
  if (form.creditor) sign = 1;
  const signed = Math.abs(balance) * sign;
  return signed === 0 ? 0 : signed;
}
