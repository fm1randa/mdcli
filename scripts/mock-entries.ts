import { localDay } from '../test/helpers.js';

// Seeded entries for GET/PUT/DELETE /v1/lancamentos/:id (parity with unit fixtures).
export const SEEDED_ENTRIES: Record<number, Record<string, unknown>> = {
  50: {
    id: 50,
    descricao: 'Poupança',
    tipo: 't',
    valor: -1000,
    valorT: 1000,
    data: '2026-01-15',
    dataPrevista: '2026-01-15',
    dataEfetiva: '2026-01-15',
    status: 'conciliado',
    conciliado: true,
    conta: 1001,
    contaT: 1003,
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
    dataEfetiva: '2026-01-10',
    dataCompetencia: '2026-01-10',
    status: 'conciliado',
    conciliado: true,
    conta: 1001,
    categoria: 10,
    categoriaPai: 0,
    parcela: '2/6',
    agendaId: 99,
    plastico: 7,
    tags: [501],
    observacoes: 'parcelado',
    ndocumento: 'NF-1',
    lembrete: 0,
    automatico: false,
    exibirCp: true,
    exibirCr: true,
    estorno: false,
    transferencia: false,
  },
  // A future occurrence of a fixed monthly series (#65): scheduled, so no
  // effective date or value yet.
  80: {
    id: 80,
    descricao: 'NuCel',
    tipo: 'd',
    valor: -45,
    valorPrevisto: -45,
    data: '2027-01-10',
    dataPrevista: '2027-01-10',
    status: 'agendado',
    conciliado: false,
    conta: 1001,
    categoria: 10,
    parcela: 'fixa',
    agendaId: 77,
    agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
    tags: [],
  },
  // A transfer between two regular accounts, Nubank -> Poupança (#123),
  // dated outside the months the list steps read.
  52: {
    id: 52,
    descricao: 'Reserva',
    tipo: 't',
    valor: -300,
    valorT: 300,
    data: '2025-06-15',
    dataPrevista: '2025-06-15',
    dataEfetiva: '2025-06-15',
    status: 'conciliado',
    conciliado: true,
    conta: 1001,
    contaT: 1004,
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
    conta: 1001,
    categoria: 10,
    tags: [],
  },
  // A refund as the server stored one (Finanças 2026-10-27): tipo r with a
  // negative value and estorno on, which the web app never sends - update -T
  // income has to fix both.
  71: {
    id: 71,
    descricao: 'Estorno café',
    tipo: 'r',
    valor: -1700,
    valorPrevisto: -1700,
    valorEfetivo: -1700,
    data: '2026-01-12',
    dataPrevista: '2026-01-12',
    dataEfetiva: '2026-01-12',
    status: 'conciliado',
    conciliado: true,
    estorno: true,
    conta: 1004,
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
export function statusLabel(payload: Body, stored: Body = payload): string | undefined {
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
    const sum = parcelas.reduce((acc, p) => acc + Math.round(p.valor * 100), 0);
    if (sum !== Math.round(Number(body.valor) * 100)) return 'valor must be the sum of the parcelas';
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

/** The API's answer to POST /v1/lancamentos for a payload that passed checkCreatePayload. */
export function createdEntry(body: Body, id: number | string): Body {
  const reconciled = Boolean(body.conciliado);
  const parcelas = body.parcelas as { valor: number; data: string }[] | undefined;
  const agenda = body.agenda as { inicial?: number; quantidade?: number } | undefined;
  return {
    id,
    descricao: body.descricao,
    conciliado: reconciled,
    dataCompetencia: body.dataCompetencia ?? null,
    // The real API answers confirmado for a confirmed, unreconciled entry (#70)
    // and pendente for an unconfirmed one dated today (Finanças 2026-10-19).
    status: statusLabel(body),
    tipo: body.tipo,
    // The server stores one entry per installment; this is the first one.
    valor: parcelas ? parcelas[0].valor : body.valor,
    valorPrevisto: parcelas ? parcelas[0].valor : (body.valorPrevisto ?? body.valor),
    valorEfetivo: body.valorEfetivo ?? null,
    data: body.data ?? new Date().toISOString(),
    dataPrevista: body.dataPrevista,
    dataEfetiva: body.dataEfetiva ?? null,
    dataCriacao: new Date().toISOString(),
    exibirCp: true,
    exibirCr: true,
    conta: body.conta ?? body.contaOrigem,
    categoria: body.categoria ?? null,
    ...(body.transferencia === true && { contaT: body.contaDestino, valorT: body.valorT }),
    ...(parcelas && { parcela: `${agenda?.inicial ?? 1}/${agenda?.quantidade}` }),
  };
}

// Card purchases created through POST, as the real API keeps them: the POST
// answers an occurrence ID ("<series>A<purchase date>", Finanças 2026-10-16)
// and the entry ID only shows up in the invoice, which lists the purchase
// with just its basic fields. GET/PUT /v1/lancamentos/:id take the entry ID.
let nextCardEntryId = 9101;
const cardPurchases: Body[] = [];

/** Stores a card purchase and returns the POST answer for it. */
export function createCardPurchase(body: Body): Body {
  const id = nextCardEntryId++;
  const parcelas = body.parcelas as { valor: number }[] | undefined;
  const valor = parcelas ? parcelas[0].valor : body.valor;
  // A purchase has no effective date but is not pending: it sits on the invoice.
  const purchase = { ...createdEntry(body, id), status: 'confirmado' };
  SEEDED_ENTRIES[id] = { ...purchase, valor, tags: body.tags ?? [], observacoes: body.observacoes ?? '' };
  cardPurchases.push({
    id,
    conta: Number(body.conta),
    descricao: body.descricao,
    valor,
    data: body.dataCompetencia,
    dataPrevista: body.dataPrevista,
    categoria: body.categoria,
  });
  return { ...createdEntry(body, `46349170A${String(body.dataCompetencia)}`), status: 'confirmado' };
}

/** The invoice items of a card's invoice due on dueDate. */
export function invoiceItems(cardId: number, dueDate: string): Body[] {
  // January 2026 invoice: one purchase and the previous invoice's payment
  // (tipo p). Bill total is -87.5; summing the items would yield +12.5.
  const seeded = dueDate.startsWith('2026-01-')
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
          contaT: 1001,
        },
      ]
    : dueDate === '2026-11-16'
      ? [
          // Installment 12/18 of a purchase made a year earlier: data is the
          // purchase date, the due date only comes from the invoice.
          {
            id: 315471241,
            descricao: 'Mac mini M4',
            valor: -301.29,
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
    .map(({ conta: _conta, dataPrevista: _due, ...item }) => ({ ...item, tipo: 'd', status: 'nconciliado' }));
  return [...seeded, ...created];
}
