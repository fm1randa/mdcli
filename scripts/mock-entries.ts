import type { CardInvoiceEntry, CreateEntryResponse, Entry, EntryId, OccurrenceId } from '../src/types/index.js';
import { localDay } from '../test/helpers.js';
import { roundToCents } from '../src/utils/currency.js';
import { isPositiveSafeInteger, parseId } from '../src/utils/parse.js';

// Seeded entries for GET/PUT/DELETE /v1/lancamentos/:id (parity with unit fixtures),
// shaped like the real GET (real use 2026-11-09): no dataEfetiva, and
// transferencia is a number, the other side's ID on a transfer.
export const SEEDED_ENTRIES: Record<number, Entry> = {
  50: {
    id: 50,
    descricao: 'Poupança',
    tipo: 't',
    valor: -1000,
    valorT: 1000,
    data: '2026-01-15',
    dataPrevista: '2026-01-15',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    contaT: 203,
    transferencia: 51,
    regime: 'ca',
    categoria: 30,
    tags: [],
    observacoes: '',
  },
  60: {
    id: 60,
    descricao: 'Notebook',
    tipo: 'd',
    valor: -250,
    data: '2026-01-10',
    dataPrevista: '2026-01-10',
    dataCompetencia: '2026-01-10',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    categoria: 10,
    categoriaPai: 0,
    parcela: '2/6',
    agendaId: 99,
    agenda: { frequencia: 1, intervalo: 'M', quantidade: 6, primeiraData: '2025-12-10' },
    regime: 'ca',
    plastico: 62,
    tags: [501],
    observacoes: 'parcelado',
    ndocumento: 'NF-1',
    lembrete: 0,
    automatico: false,
    exibirCp: true,
    exibirCr: true,
    estorno: false,
    transferencia: 0,
  },
  // A future occurrence of a fixed monthly series (#65): scheduled, so no
  // effective date or value yet.
  80: {
    id: 80,
    descricao: 'Assinatura Teste',
    tipo: 'd',
    valor: -45,
    valorPrevisto: -45,
    data: '2027-01-10',
    dataPrevista: '2027-01-10',
    status: 'agendado',
    conciliado: false,
    conta: 201,
    categoria: 10,
    parcela: 'fixa',
    agendaId: 77,
    agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
    tags: [],
  },
  // A transfer between two regular accounts, Conta Teste -> Poupança (#123),
  // dated outside the months the list steps read.
  52: {
    id: 52,
    descricao: 'Reserva',
    tipo: 't',
    valor: -300,
    valorT: 300,
    data: '2025-06-15',
    dataPrevista: '2025-06-15',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    contaT: 204,
    transferencia: 53,
    categoria: 30,
    tags: [],
    observacoes: '',
  },
  70: {
    id: 70,
    descricao: 'Café',
    tipo: 'd',
    valor: -12.5,
    data: '2026-01-12',
    dataPrevista: '2026-01-12',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    categoria: 10,
    tags: [],
  },
  // A refund as the server stored one (Real use 2026-10-27): tipo r with a
  // negative value and estorno on, which the web app never sends - update -T
  // income has to fix both.
  71: {
    id: 71,
    descricao: 'Estorno Teste',
    tipo: 'r',
    valor: -1700,
    valorPrevisto: -1700,
    valorEfetivo: -1700,
    data: '2026-01-12',
    dataPrevista: '2026-01-12',
    dataReconhecimento: '2026-01-12',
    status: 'conciliado',
    conciliado: true,
    estorno: true,
    conta: 204,
    categoria: 20,
    tags: [],
  },
};

type Body = Record<string, unknown>;

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

export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

// The routes check a payload before they build an answer from it, so a field
// that is still not a number here is a CLI regression: fail the request loudly
// instead of coercing it the way Number() would.
export function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`mock: ${field} must be a number, got ${JSON.stringify(value)}`);
  return value;
}

/** An account ID as the CLI sends it: a JSON number, or a digit string in a create payload's conta. */
export function idOf(value: unknown): number | undefined {
  if (typeof value === 'string') return parseId(value);
  return isPositiveSafeInteger(value) ? value : undefined;
}

export function requiredId(value: unknown, field: string): number {
  const id = idOf(value);
  if (id === undefined) throw new Error(`mock: ${field} must be an ID, got ${JSON.stringify(value)}`);
  return id;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

/** A numeric entry ID from the mock. */
export const mockEntryId = (id: number): EntryId => id as EntryId;

/** An occurrence ID ("<series>A<date>") from the mock. */
const mockOccurrenceId = (id: string): OccurrenceId => id as OccurrenceId;

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

interface StoredCardPurchase {
  id: number;
  conta: number;
  descricao: string;
  valor: number;
  data: string;
  dataPrevista: string;
  categoria: number | null;
}

// Card purchases created through POST, as the real API keeps them: the POST
// answers an occurrence ID ("<series>A<purchase date>", Real use 2026-10-16)
// and the entry ID only shows up in the invoice, which lists the purchase
// with just its basic fields. GET/PUT /v1/lancamentos/:id take the entry ID.
let nextCardEntryId = 9101;
const cardPurchases: StoredCardPurchase[] = [];

/** Stores a card purchase and returns the POST answer for it. */
export function createCardPurchase(body: Body): CreateEntryResponse {
  const id = nextCardEntryId++;
  const parcelas = body.parcelas as { valor: number }[] | undefined;
  const valor = parcelas ? parcelas[0].valor : requiredNumber(body.valor, 'valor');
  // A purchase has no effective date but is not pending: it sits on the invoice.
  const { dataEfetiva: _effective, ...purchase } = createdEntry(body, mockEntryId(id));
  SEEDED_ENTRIES[id] = { ...purchase, status: 'confirmado', valor, lembrete: 0, tags: numberArray(body.tags), observacoes: String(body.observacoes ?? '') };
  cardPurchases.push({
    id,
    conta: requiredId(body.conta, 'conta'),
    descricao: String(body.descricao),
    valor,
    data: String(body.dataCompetencia),
    dataPrevista: String(body.dataPrevista),
    categoria: numberOrNull(body.categoria),
  });
  return { ...createdEntry(body, mockOccurrenceId(`1234567A${String(body.dataCompetencia)}`)), status: 'confirmado' };
}

/** The invoice items of a card's invoice due on dueDate. */
export function invoiceItems(cardId: number, dueDate: string): CardInvoiceEntry[] {
  // January 2026 invoice: one purchase and the previous invoice's payment
  // (tipo p). Bill total is -87.5; summing the items would yield +12.5.
  const seeded: CardInvoiceEntry[] = dueDate.startsWith('2026-01-')
    ? [
        {
          id: 1,
          descricao: 'Mercado',
          valor: -87.5,
          data: '2026-01-05',
          categoria: 11,
          tipo: 'd',
          status: 'nconciliado',
        },
        {
          id: 2,
          descricao: 'Pagamento cartão',
          valor: 100,
          data: '2025-12-16',
          categoria: 30,
          tipo: 'p',
          status: 'conciliado',
          contaT: 201,
        },
      ]
    : dueDate === '2026-11-16'
      ? [
          // Installment 12/18 of a purchase made a year earlier: data is the
          // purchase date, the due date only comes from the invoice.
          {
            id: 123456,
            descricao: 'Item Parcelado',
            valor: -123.45,
            data: '2025-11-19',
            categoria: 11,
            parcela: '12/18',
            tipo: 'd',
            status: 'nconciliado',
          },
        ]
      : [];
  const created = cardPurchases
    .filter((p) => p.conta === cardId && p.dataPrevista === dueDate)
    .map(({ conta: _conta, dataPrevista: _due, ...item }): CardInvoiceEntry => ({ ...item, tipo: 'd', status: 'nconciliado' }));
  return [...seeded, ...created];
}
