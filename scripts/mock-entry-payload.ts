// What POST and PUT /v1/lancamentos accept and answer in scripts/mock-api.ts.
import type { CreateEntryResponse, Entry, EntryId, OccurrenceId } from '../src/types/index.js';
import { localDay } from '../test/helpers.js';
import { roundToCents } from '../src/utils/currency.js';
import { type Body, numberArray, numberOrNull, requiredId, requiredNumber } from './mock-http.js';

/**
 * The label the API answers with after a POST or PUT, from the status object
 * the payload sends, the way the web app words it after a save (md.js):
 * conciliado; else confirmado when the entry has an effective date (which
 * confirms it even with confirmado: false) or confirmado: true; else agendado
 * for a planned date after today and pendente otherwise. `stored` is the
 * entry as saved (the PUT merges the payload over the existing entry).
 * Undefined when the payload has no status object.
 */
export function statusLabel(payload: Body, stored: Body = payload): Entry['status'] | undefined {
  const status = payload.status;
  if (status === null || typeof status !== 'object') return undefined;
  const { confirmado, conciliado } = status as { confirmado?: boolean; conciliado?: boolean };
  if (conciliado === true) return 'conciliado';
  if (stored.dataEfetiva != null || confirmado === true) return 'confirmado';
  const planned = String(stored.dataPrevista ?? stored.data ?? '').slice(0, 10);
  return planned > localDay(0) ? 'agendado' : 'pendente';
}

/**
 * What the web app sends for the shapes the CLI creates (deduced from the
 * public bundle md.js); anything else answers 400 so verify.sh catches a
 * regression through the real CLI path.
 */
export function checkCreatePayload(body: Body): string | null {
  const status = body.status as { confirmado?: boolean; conciliado?: boolean } | undefined;
  if (body.transferencia === true) {
    if (body.tipo !== 't') return 'a transfer has tipo t';
    if (body.conta !== undefined) return 'a transfer names contaOrigem/contaDestino, not conta';
    if (typeof body.contaOrigem !== 'number' || typeof body.contaDestino !== 'number') {
      return 'contaOrigem and contaDestino are required for a transfer';
    }
    if (body.contaOrigem === body.contaDestino) return 'origin and destination must differ';
    if (typeof body.valor !== 'number' || body.valor >= 0) return 'a transfer is sent from the origin side (negative valor)';
  } else if (body.tipo === 't') {
    return 'tipo t without transferencia: true';
  }
  if (status?.confirmado === false && (body.dataEfetiva != null || body.valorEfetivo != null)) {
    return 'an unconfirmed entry has no dataEfetiva/valorEfetivo';
  }
  if (status?.confirmado === false && (status.conciliado === true || body.conciliado === true)) {
    return 'an unconfirmed entry cannot be reconciled';
  }
  const agenda = body.agenda as { repeticao?: string; quantidade?: number } | undefined;
  if (agenda?.repeticao === 'p') {
    const parcelas = body.parcelas as { valor: number; data: string }[] | undefined;
    if (!Array.isArray(parcelas) || parcelas.length !== agenda.quantidade) {
      return 'an installment series needs one parcela per installment';
    }
    const sum = parcelas.reduce((acc, p) => acc + p.valor, 0);
    if (roundToCents(sum) !== roundToCents(requiredNumber(body.valor, 'valor'))) return 'valor must be the sum of the parcelas';
  }
  return null;
}

/**
 * The accounts of a PUT /v1/lancamentos/:id (update --account, #123): a
 * transfer names them as contaOrigem/contaDestino, any other entry as conta;
 * all must exist, and a card purchase carries its purchase date.
 * `accountType` is the tipo of an account ID, undefined when there is none.
 */
export function checkUpdateAccounts(body: Body, accountType: (conta: unknown) => string | undefined): string | null {
  const transfer = body.transferencia === true;
  const accounts = transfer ? [body.contaOrigem, body.contaDestino] : [body.conta];
  if (accounts.some((conta) => accountType(conta) === undefined)) return 'conta must name an existing account';
  if (transfer && body.contaOrigem === body.contaDestino) return 'origin and destination must differ';
  if (!transfer && accountType(body.conta) === 'CARTAOCREDITO' && typeof body.dataCompetencia !== 'string') {
    return 'dataCompetencia is required for credit card entries';
  }
  return null;
}

export function entryType(tipo: unknown): CreateEntryResponse['tipo'] {
  return tipo === 'r' || tipo === 't' || tipo === 'p' ? tipo : 'd';
}

/** A numeric entry ID from the mock. */
export const mockEntryId = (id: number): EntryId => id as EntryId;

/** An occurrence ID ("<series>A<date>") from the mock. */
export const mockOccurrenceId = (id: string): OccurrenceId => id as OccurrenceId;

/** The API's answer to POST /v1/lancamentos for a payload that passed checkCreatePayload. */
export function createdEntry(body: Body, id: EntryId | OccurrenceId): CreateEntryResponse {
  const reconciled = Boolean(body.conciliado);
  const parcelas = body.parcelas as { valor: number; data: string }[] | undefined;
  const agenda = body.agenda as { inicial?: number; quantidade?: number } | undefined;
  return {
    id,
    descricao: String(body.descricao),
    conciliado: reconciled,
    dataCompetencia: typeof body.dataCompetencia === 'string' ? body.dataCompetencia : null,
    // The real API answers confirmado for a confirmed, unreconciled entry (#70)
    // and pendente for an unconfirmed one dated today (Real use 2026-10-19).
    status: statusLabel(body) ?? 'pendente',
    tipo: entryType(body.tipo),
    // The server stores one entry per installment; this is the first one.
    valor: parcelas ? parcelas[0].valor : requiredNumber(body.valor, 'valor'),
    valorPrevisto: parcelas ? parcelas[0].valor : requiredNumber(body.valorPrevisto ?? body.valor, 'valorPrevisto'),
    valorEfetivo: numberOrNull(body.valorEfetivo),
    data: String(body.data ?? new Date().toISOString()),
    dataPrevista: String(body.dataPrevista ?? ''),
    dataEfetiva: typeof body.dataEfetiva === 'string' ? body.dataEfetiva : null,
    dataCriacao: new Date().toISOString(),
    exibirCp: true,
    exibirCr: true,
    permissoes: { visivel: true, acoes: { conciliar: true, confirmar: true, editar: true, excluir: true, clonar: true } },
    estorno: false,
    conta: requiredId(body.conta ?? body.contaOrigem, 'conta'),
    categoria: numberOrNull(body.categoria),
    tags: numberArray(body.tags),
    observacoes: String(body.observacoes ?? ''),
    lembrete: '0',
    automatico: body.automatico === true,
    ...(body.transferencia === true && { contaT: requiredId(body.contaDestino, 'contaDestino'), valorT: requiredNumber(body.valorT, 'valorT') }),
    ...(parcelas && { parcela: `${agenda?.inicial ?? 1}/${agenda?.quantidade}` }),
  };
}
