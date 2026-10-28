import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { fetchAccountById, fetchCategories, isCreditCard } from '../../lib/api.js';
import { resolveAccountOrExit } from '../account-id.js';
import type { Account } from '../../types/index.js';

// tipoL of the system "Transferência" category, the one the web app picks
// for a new transfer when the user leaves the category empty.
const TRANSFER_CATEGORY_TIPO_L = 15;

/**
 * Validates --to-account for `entries create -T transfer` and returns the
 * destination account ID. The web app sends a transfer as one entry naming
 * contaOrigem/contaDestino; it refuses the same account on both sides.
 */
export async function resolveTransferDestination(origin: Account | undefined, originId: number, toAccount: string): Promise<number> {
  const destinationId = await resolveAccountOrExit(toAccount);
  if (destinationId === originId) {
    exitWithError(t('errorTransferSameAccount'));
  }
  const destination = await fetchAccountById(destinationId);
  if (!origin || !destination) {
    exitWithError(t('errorAccountNotFoundInList', origin ? destinationId : originId));
  }
  checkTransferAccounts(origin, destination);
  return destinationId;
}

/** Transfers the CLI cannot write the way the web app does; shared with update. */
export function checkTransferAccounts(origin: Account, destination: Account): void {
  // Paying a card invoice (destination card) and card-to-account transfers
  // carry invoice dates and a plastico the CLI does not model yet.
  if (isCreditCard(origin) || isCreditCard(destination)) {
    exitWithError(t('errorTransferCreditCard'));
  }
  // Between currencies each half has its own value (valorT), which the CLI
  // has no option for.
  if (origin.moeda !== destination.moeda) {
    exitWithError(t('errorTransferDifferentCurrencies'));
  }
}

/** The category the web app defaults a new transfer to. */
export async function defaultTransferCategory(): Promise<number> {
  const { items } = await fetchCategories();
  const category = items.find((c) => c.tipoL === TRANSFER_CATEGORY_TIPO_L && c.status);
  if (!category) {
    exitWithError(t('errorNoTransferCategory'));
  }
  return category.id;
}
