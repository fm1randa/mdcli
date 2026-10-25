import chalk from 'chalk';
import { fetchAccounts, fetchPlastics, isCreditCard } from '../../lib/api.js';
import { exitWithError } from '../../utils/action.js';
import { toLocalDateString } from '../../lib/dates.js';
import type { Account, Entry, UpdateEntryPayload } from '../../types/index.js';
import { formCardDueDate } from './card-invoice.js';
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
 * Refuses an inactive account the entry moves to: the web app's account
 * selectors leave it out (mdwSelect, contas: status !== false).
 */
function checkActive(account: Account): void {
  if (account.status === false) {
    exitWithError(
      `Account "${account.nome}" (${account.id}) is inactive, so the web app does not offer it. ` +
        'Use an active account (see: mdcli accounts list --active) or reactivate it in Meu Dinheiro.'
    );
  }
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
  if (originId !== current.origin) checkActive(get(originId));
  if (destinationId !== current.destination) checkActive(get(destinationId));
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
 * update built, with the fields the web app's edit form resets when saving it
 * there (mdb.js, controller sf: L when the form opens, G/tt/Dt on the account
 * watch, ut and It on save): the competence date and automatico on a regular
 * account, the invoice, status and plastic on a card. The same account again
 * is accepted and changes nothing else (other updates keep echoing the entry).
 */
export async function moveEntry(payload: UpdateEntryPayload, existing: Entry, accountId: number, context: MoveContext): Promise<void> {
  payload.conta = accountId;
  if (accountId === existing.conta) return;

  const get = await accountLookup();
  const fromCard = isCreditCard(get(existing.conta));
  const target = get(accountId);
  checkActive(target);
  if (isCreditCard(target)) {
    await moveToCard(payload, existing, target, fromCard, context);
    return;
  }
  // Opening the edit form sets the competence date to the recognition date
  // (sf, L); saving to a regular account keeps it, as a calendar day (ut).
  payload.dataCompetencia = existing.dataReconhecimento && day(existing.dataReconhecimento);
  if (fromCard) moveOffCard(payload, existing, context);
  // ut: an unconfirmed entry dated up to today has nothing left to confirm
  // automatically.
  if (!payload.status.confirmado && day(payload.dataPrevista) <= toLocalDateString(new Date())) {
    payload.automatico = false;
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
  payload.dataPrevista = await formCardDueDate(card, purchaseDate, existing.agenda);
  // ut: no effective date on a card, except for a reconciled occurrence of
  // an endless series.
  const endless = existing.agenda?.quantidade === -1;
  payload.dataEfetiva = endless && conciliado ? purchaseDate : null;
  setValues(payload, conciliado);
  payload.plastico = await cardPlastic(card.id, existing.plastico);
}

/**
 * The plastic the web's Cartão field picks for a card the entry moves to
 * (editarLancamento.html: mdw-select=plasticos filter="{conta: vm.l.conta}"
 * default-values="{tipo:'T'}"): the entry's plastic when the new card lists
 * it (mdwSelect, f), as for a purchase that left this card and comes back
 * with its plastic echoed; else the first one matching tipo T.
 */
async function cardPlastic(cardId: number, current: number | undefined): Promise<number | null> {
  const plastics = await fetchPlastics();
  // The field lists the card's active, visible plastics by name (mdwSelect, S).
  const listed = plastics
    .filter((p) => p.conta === cardId && p.status !== false && (!p.permissoes || p.permissoes.visivel))
    .sort((a, b) => (a.nome.toLowerCase() < b.nome.toLowerCase() ? -1 : 1));
  if (current != null && listed.some((p) => p.id === current)) return current;
  // default-values is an Angular filter: tipo contains "t", any case. With
  // none, the field clears its model (mdwSelect, M) and null is sent.
  return listed.find((p) => p.tipo.toLowerCase().includes('t'))?.id ?? null;
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
  // date and keeps its planned date (the invoice due date), even with -D: the
  // form's date only feeds dataPrevista on a card (tt). Otherwise the form's
  // date becomes the planned one.
  if (confirmado) {
    payload.dataEfetiva = formDate;
    payload.dataPrevista = existing.dataPrevista || formDate;
  } else {
    payload.dataPrevista = formDate;
    payload.dataEfetiva = null;
  }
  setValues(payload, confirmado);
}

/**
 * The values the web app saves (mdb.js, sf, It): a confirmed or reconciled
 * entry is effective at its value and keeps its planned value, signed by its
 * type; otherwise it is planned at its value, with nothing effective.
 */
function setValues(payload: UpdateEntryPayload, effective: boolean): void {
  if (effective) {
    const sign = payload.tipo !== 'r' ? -1 : 1;
    payload.valorEfetivo = payload.valor;
    payload.valorPrevisto = Math.abs(payload.valorPrevisto || payload.valor) * sign;
  } else {
    payload.valorPrevisto = payload.valor;
    payload.valorEfetivo = null;
  }
}
