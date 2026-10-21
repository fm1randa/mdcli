import type { Entry, UpdateTransferPayload } from '../../types/index.js';
import type { EntryStatusChoice } from './status.js';

/** The effective (confirmed) date and values of a PUT payload. */
type EffectiveField = 'dataEfetiva' | 'valorEfetivo' | 'valorEfetivoT';
type EffectiveFields = { dataEfetiva?: string | null; valorEfetivo?: number | null; valorEfetivoT?: number | null };

// A scheduled occurrence has no effective date or value yet, and filling them
// in is what confirms it: the API then ignores confirmado: false. Send back
// whatever the entry already had (usually nothing) for these fields.
export function keepUnconfirmed(payload: EffectiveFields, existing: Entry, fields: readonly EffectiveField[]): void {
  const had: EffectiveFields = {
    dataEfetiva: existing.dataEfetiva,
    valorEfetivo: existing.valorEfetivo,
    valorEfetivoT: existing.valorEfetivoT,
  };
  for (const field of fields) {
    if (had[field] === undefined) delete payload[field];
    else Object.assign(payload, { [field]: had[field] });
  }
}

// Turning Confirmado off in the web app sends the effective date and values
// as null: an entry without them is scheduled again.
export function clearEffective(payload: EffectiveFields, fields: readonly EffectiveField[]): void {
  for (const field of fields) payload[field] = null;
}

export interface TransferOverrides {
  description?: string;
  value?: number;
  date?: string;
  categoryId: number | null;
  tagIds?: number[];
  notes?: string;
  /** From buildEntryStatus; effective covers dataEfetiva, valorEfetivo and valorEfetivoT. */
  status: EntryStatusChoice;
}

// A transfer (tipo "t") is a pair of mirrored entries, and the API rejects the
// PUT that works for every other entry - echoing the raw entry back is not
// enough, it answers 400 "Erro inesperado". The web app never sends the raw
// entry either: it normalizes the pair to the origin side (the negative half),
// names the two accounts contaOrigem/contaDestino, and marks the payload with
// transferencia: true instead of tipo: "t". The entry we were handed can be
// either half of the pair, so flip it to the origin side first.
export function buildTransferPayload(
  entryId: number,
  existing: Entry,
  overrides: TransferOverrides
): UpdateTransferPayload {
  const outgoing = existing.valor < 0;
  const originAccount = outgoing ? existing.conta : existing.contaT;
  const destinationAccount = outgoing ? existing.contaT : existing.conta;

  if (originAccount === undefined || destinationAccount === undefined) {
    throw new Error(
      `Entry ${entryId} is a transfer but only names one account. It cannot be updated by the CLI.`
    );
  }

  // A value change makes both halves symmetric. Without one, keep whatever the
  // two halves hold today - a transfer between currencies has two magnitudes.
  const originValue = overrides.value !== undefined
    ? -Math.abs(overrides.value)
    : (outgoing ? existing.valor : existing.valorT ?? -existing.valor);
  const destinationValue = overrides.value !== undefined
    ? Math.abs(overrides.value)
    : (outgoing ? existing.valorT ?? -existing.valor : existing.valor);

  const date = overrides.date ?? existing.dataPrevista;
  // The web app takes whichever half of the pair names a card and sends it as
  // one plastico, without flipping it along with the accounts. Mirror that.
  const plastico = existing.plastico ?? existing.plasticoT;

  // The payload has to be listed field by field, so anything the entry carries
  // that the list forgets is dropped on save - the failure #10 fixed for other
  // entries by echoing the raw entry back. A transfer refuses that echo, so
  // carry the fields an installment, a card, or a savings-goal transfer needs
  // one by one, and only when the entry actually has them.
  const carried: Partial<UpdateTransferPayload> = {};
  for (const field of ['dataCompetencia', 'parcela', 'agendaId', 'regime', 'estorno', 'detalhes', 'metaEconomiaDestino'] as const) {
    if (existing[field] !== undefined) Object.assign(carried, { [field]: existing[field] });
  }
  // categoriaPai is the parent of categoria and the categories endpoint does
  // not expose the parent, so a new category leaves us unable to recompute it.
  // Drop the stale one and let the server derive it.
  if (overrides.categoryId === null && existing.categoriaPai !== undefined) {
    carried.categoriaPai = existing.categoriaPai;
  }

  const { confirmado, conciliado, effective } = overrides.status;
  const payload: UpdateTransferPayload = {
    ...carried,
    id: entryId,
    descricao: overrides.description ?? existing.descricao,
    transferencia: true,
    // Unlike other entries, a transfer also carries confirmado at the top.
    status: { confirmado, conciliado },
    confirmado,
    conciliado,
    conta: originAccount,
    contaT: destinationAccount,
    contaOrigem: originAccount,
    contaDestino: destinationAccount,
    valor: originValue,
    valorPrevisto: originValue,
    valorEfetivo: originValue,
    valorT: destinationValue,
    valorPrevistoT: destinationValue,
    valorEfetivoT: destinationValue,
    data: date,
    dataPrevista: date,
    dataEfetiva: overrides.date ?? existing.dataEfetiva ?? date,
    categoria: overrides.categoryId ?? existing.categoria ?? null,
    tags: overrides.tagIds ?? existing.tags ?? [],
    observacoes: overrides.notes ?? existing.observacoes ?? '',
    ndocumento: existing.ndocumento ?? '',
    lembrete: existing.lembrete ?? 0,
    automatico: existing.automatico ?? false,
    exibirCp: existing.exibirCp ?? true,
    exibirCr: existing.exibirCr ?? true,
    ...(plastico !== undefined && { plastico }),
  };
  if (effective === 'clear') {
    clearEffective(payload, ['dataEfetiva', 'valorEfetivo', 'valorEfetivoT']);
  } else if (effective === 'keep') {
    keepUnconfirmed(payload, existing, ['dataEfetiva', 'valorEfetivo', 'valorEfetivoT']);
  }
  return payload;
}
