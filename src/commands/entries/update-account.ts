import chalk from 'chalk';
import { fetchAccounts, isCreditCard } from '../../lib/api.js';
import { exitWithError } from '../../utils/action.js';
import type { Account, Entry, UpdateEntryPayload } from '../../types/index.js';
import { resolveCardDueDate } from './card-invoice.js';
import { checkTransferAccounts } from './create-transfer.js';
import { buildEntryStatus, type EntryStatusFlags } from './status.js';
import { transferSides } from './update-transfer.js';

/** Looks Accounts up by ID in one fetch, exiting on an ID the list lacks. */
async function accountLookup(): Promise<(id: number) => Account> {
  const { items } = await fetchAccounts();
  return (id) => {
    const account = items.find((a) => a.id === id);
    if (!account) exitWithError(`Account ${id} was not found in the account list.`);
    return account;
  };
}

/**
 * The accounts a transfer is saved with after --account (origin) and
 * --to-account (destination). The web app edits contaOrigem/contaDestino and
 * refuses the same account on both sides (mdb.js, validate `M`). Card and
 * cross-currency pairs are refused as in `entries create`, before and after
 * the change: moving one side of a card payment still carries invoice dates.
 */
export async function moveTransfer(
  entryId: number,
  existing: Entry,
  accountId: number | undefined,
  toAccountId: number | undefined
): Promise<{ originId: number; destinationId: number }> {
  const current = transferSides(entryId, existing);
  const originId = accountId ?? current.origin;
  const destinationId = toAccountId ?? current.destination;
  if (originId === destinationId) {
    exitWithError(`A transfer needs two different accounts: origin and destination would both be account ${originId}.`);
  }
  const get = await accountLookup();
  checkTransferAccounts(get(current.origin), get(current.destination));
  checkTransferAccounts(get(originId), get(destinationId));
  return { originId, destinationId };
}

interface MoveContext {
  /** -D/--date, when given. */
  date?: string;
  /** The status flags, to redo the status of a purchase leaving a card. */
  flags: EntryStatusFlags;
}

const day = (date: string): string => date.slice(0, 10);

/**
 * Points an entry (not a transfer) at another account, on top of the payload
 * update built. Between regular accounts only conta changes. Into or out of a
 * credit card, dates and status follow what the web app's edit form sends on
 * save (mdb.js, controller sf: G/tt/Dt on the account watch, ut and It on
 * save). The same account again is accepted and changes nothing else, like
 * the web, which only recomputes the invoice when the account changes.
 */
export async function moveEntry(payload: UpdateEntryPayload, existing: Entry, accountId: number, context: MoveContext): Promise<void> {
  payload.conta = accountId;
  if (accountId === existing.conta) return;

  const get = await accountLookup();
  const fromCard = isCreditCard(get(existing.conta));
  const target = get(accountId);
  if (isCreditCard(target)) {
    await moveToCard(payload, existing, target, fromCard, context);
  } else if (fromCard) {
    moveOffCard(payload, existing, context);
  }
}

async function moveToCard(
  payload: UpdateEntryPayload,
  existing: Entry,
  card: Account,
  fromCard: boolean,
  { date, flags }: MoveContext
): Promise<void> {
  if (flags.reconciled) {
    exitWithError('The CLI does not reconcile card purchases: drop -r/--reconciled to move the entry to a credit card.');
  }
  if (flags.pending || flags.confirmed) {
    console.error(
      chalk.yellow('⚠'),
      `Card purchases have no pending or confirmed state: the purchase goes to the invoice ${existing.conciliado ? 'reconciled, as it was' : 'unreconciled'}. ${flags.pending ? '--pending' : '--confirmed'} was ignored.`
    );
  }
  // The form's date: the purchase date on a card, else the effective or
  // planned date (sf, L).
  const purchaseDate = day(date ?? (fromCard ? existing.data : existing.dataEfetiva ?? existing.dataPrevista));
  // A card has only Conciliado: G sets confirmado = conciliado.
  const conciliado = existing.conciliado === true;
  payload.status = { confirmado: conciliado, conciliado };
  payload.conciliado = conciliado;
  payload.data = purchaseDate;
  payload.dataCompetencia = purchaseDate;
  // The web walks from the card's next due date (tt/Dt); the CLI uses the
  // invoice lookup entries create uses, with each invoice's real closing date.
  payload.dataPrevista = await resolveCardDueDate(card, purchaseDate);
  // ut: no effective date on a card, except for a reconciled occurrence of
  // an endless series.
  const endless = existing.agenda?.quantidade === -1;
  payload.dataEfetiva = endless && conciliado ? purchaseDate : null;
  // It: the effective value only on a confirmed or reconciled entry.
  payload.valorEfetivo = conciliado ? payload.valor : null;
  // plastico is the old card's (or none). The web's Cartão field then picks
  // the new card's holder plastico; the CLI cannot list plastics and sends
  // none, as entries create does for a card purchase.
  delete payload.plastico;
}

function moveOffCard(payload: UpdateEntryPayload, existing: Entry, { date, flags }: MoveContext): void {
  // The web form shows a card purchase as Confirmado only when the API says
  // confirmado/conciliado (sf, L); nconciliado opens unconfirmed.
  const confirmedOnCard = existing.status === 'confirmado' || existing.status === 'conciliado';
  const { confirmado, conciliado } = buildEntryStatus(flags, {
    existing: { status: confirmedOnCard ? existing.status : 'pendente', conciliado: existing.conciliado },
  });
  const formDate = day(date ?? existing.data);
  payload.status = { confirmado, conciliado };
  payload.conciliado = conciliado;
  payload.data = formDate;
  // ut for a regular account: a confirmed entry is effective on the form's
  // date and keeps its planned date (the invoice due date); otherwise the
  // form's date becomes the planned one.
  if (confirmado) {
    payload.dataEfetiva = formDate;
    payload.dataPrevista = date ?? existing.dataPrevista;
    payload.valorEfetivo = payload.valor;
  } else {
    payload.dataPrevista = formDate;
    payload.dataEfetiva = null;
    payload.valorEfetivo = null;
  }
}
