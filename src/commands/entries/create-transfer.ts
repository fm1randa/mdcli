import { exitWithError } from '../../utils/action.js';
import { fetchAccountById, fetchCategories, isCreditCard } from '../../lib/api.js';
import { resolveId } from '../../lib/aliases.js';
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
  const destinationId = await resolveId('accounts', toAccount);
  if (destinationId === null) {
    exitWithError(`Unknown account: ${toAccount}`);
  }
  if (destinationId === originId) {
    exitWithError('A transfer needs two different accounts: --to-account names the same account as --account.');
  }
  const destination = await fetchAccountById(destinationId);
  if (!origin || !destination) {
    exitWithError(`Account ${origin ? destinationId : originId} was not found in the account list.`);
  }
  // Paying a card invoice (destination card) and card-to-account transfers
  // carry invoice dates and a plastico the CLI does not model yet.
  if (isCreditCard(origin) || isCreditCard(destination)) {
    exitWithError('Transfers to or from a credit card account are not supported by the CLI yet. Use the web app.');
  }
  // Between currencies each half has its own value (valorT), which the CLI
  // has no option for.
  if (origin.moeda !== destination.moeda) {
    exitWithError('Transfers between accounts in different currencies are not supported by the CLI yet. Use the web app.');
  }
  return destinationId;
}

/** The category the web app defaults a new transfer to. */
export async function defaultTransferCategory(): Promise<number> {
  const { items } = await fetchCategories();
  const category = items.find((c) => c.tipoL === TRANSFER_CATEGORY_TIPO_L && c.status);
  if (!category) {
    exitWithError('No transfer category found. Pass one with -c, --category <id|alias>. See: mdcli categories list');
  }
  return category.id;
}
