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
};

type Body = Record<string, unknown>;

/**
 * The label the API gives an entry, the way the web app words it after a save
 * (md.js): conciliado, else confirmado when it has an effective date, else
 * agendado for a planned date after today and pendente otherwise.
 */
export function entryStatusLabel(entry: Body): string {
  if (entry.conciliado === true) return 'conciliado';
  if (entry.dataEfetiva != null) return 'confirmado';
  const planned = String(entry.dataPrevista ?? entry.data ?? '').slice(0, 10);
  const today = new Date().toLocaleDateString('en-CA');
  return planned > today ? 'agendado' : 'pendente';
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
    status: entryStatusLabel(body),
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
  // A purchase seeded in the January 2026 invoice (cards invoice steps).
  const seeded = dueDate.startsWith('2026-01-')
    ? [{ id: 1, descricao: 'Mercado', valor: -87.5, data: '2026-01-05', categoria: 11 }]
    : [];
  const created = cardPurchases
    .filter((p) => p.conta === cardId && p.dataPrevista === dueDate)
    .map(({ conta: _conta, dataPrevista: _due, ...item }) => item);
  return [...seeded, ...created];
}
