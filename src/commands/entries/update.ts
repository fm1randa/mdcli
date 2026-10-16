import { ENTRY_STATUS_LABELS } from '../../lib/normalize.js';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { updateEntry, fetchEntry } from '../../lib/api.js';
import { resolveId, resolveIds } from '../../lib/aliases.js';
import type { CreateEntryResponse, Entry, UpdateEntryPayload } from '../../types/index.js';
import { mapTypeToApi, parseTypeOption } from './create.js';
import { formatCurrency, formatStatus } from './format.js';
import { describeScope, resolveSeriesScope, type SeriesScope } from './series.js';

interface UpdateOptions {
  description?: string;
  value?: string;
  type?: string;
  category?: string;
  date?: string;
  tags?: string;
  notes?: string;
  pending?: boolean;
  reconciled?: boolean;
  scope?: SeriesScope;
  json?: boolean;
}

const STATUS_LABELS = ENTRY_STATUS_LABELS;

/** The status the API answered with - never assumed from what we sent. */
function describeStatus(status: unknown): string {
  if (typeof status === 'string' && STATUS_LABELS[status]) {
    return formatStatus(STATUS_LABELS[status]);
  }
  if (status !== null && typeof status === 'object' && 'confirmado' in status) {
    const { confirmado, conciliado } = status as { confirmado?: boolean; conciliado?: boolean };
    return formatStatus(conciliado ? 'reconciled' : confirmado ? 'pending' : 'scheduled');
  }
  return chalk.gray(status === undefined ? '(not returned by the API)' : String(status));
}

function reportUpdate(response: CreateEntryResponse, json?: boolean, todos?: boolean): void {
  if (json) {
    const scope = todos === undefined ? {} : { scope: todos ? 'following' : 'this' };
    console.log(JSON.stringify({ ...response, ...scope }, null, 2));
    return;
  }

  logger.success(`Entry updated successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${response.id}`);
  console.log(`  ${chalk.gray('Description:')} ${response.descricao}`);
  console.log(`  ${chalk.gray('Value:')} ${formatCurrency(response.valor)}`);
  console.log(`  ${chalk.gray('Date:')} ${response.data}`);
  console.log(`  ${chalk.gray('Status:')} ${describeStatus(response.status)}`);
  if (todos !== undefined) {
    console.log(`  ${chalk.gray('Scope:')} ${describeScope(todos)}`);
  }
}

/** A scheduled entry stays scheduled unless a status flag says otherwise. */
function staysScheduled(options: UpdateOptions, existing: Entry): boolean {
  return existing.status === 'agendado' && !options.pending && !options.reconciled;
}

// A scheduled occurrence has no effective date or value yet, and filling them
// in is what confirms it: the API then ignores confirmado: false. Send back
// whatever the entry already had (usually nothing) for these fields.
function keepUnconfirmed(payload: Record<string, unknown>, existing: Entry, fields: readonly (keyof Entry)[]): void {
  for (const field of fields) {
    if (existing[field] === undefined) delete payload[field];
    else payload[field] = existing[field];
  }
}

function resolveReconciled(options: UpdateOptions, existing: Entry): boolean {
  if (options.pending) return false;
  if (options.reconciled) return true;
  return existing.conciliado ?? false;
}

interface TransferOverrides {
  description?: string;
  value?: number;
  date?: string;
  categoryId: number | null;
  tagIds?: number[];
  notes?: string;
  reconciled: boolean;
  scheduled: boolean;
}

// A transfer (tipo "t") is a pair of mirrored entries, and the API rejects the
// PUT that works for every other entry - echoing the raw entry back is not
// enough, it answers 400 "Erro inesperado". The web app never sends the raw
// entry either: it normalizes the pair to the origin side (the negative half),
// names the two accounts contaOrigem/contaDestino, and marks the payload with
// transferencia: true instead of tipo: "t". The entry we were handed can be
// either half of the pair, so flip it to the origin side first.
function buildTransferPayload(
  entryId: number,
  existing: Entry,
  overrides: TransferOverrides
): Record<string, unknown> {
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
  const carried: Record<string, unknown> = {};
  for (const field of ['dataCompetencia', 'parcela', 'agendaId', 'regime', 'estorno', 'detalhes', 'metaEconomiaDestino'] as const) {
    if (existing[field] !== undefined) carried[field] = existing[field];
  }
  // categoriaPai is the parent of categoria and the categories endpoint does
  // not expose the parent, so a new category leaves us unable to recompute it.
  // Drop the stale one and let the server derive it.
  if (overrides.categoryId === null && existing.categoriaPai !== undefined) {
    carried.categoriaPai = existing.categoriaPai;
  }

  const confirmed = !overrides.scheduled;
  const payload: Record<string, unknown> = {
    ...carried,
    id: entryId,
    descricao: overrides.description ?? existing.descricao,
    transferencia: true,
    status: { confirmado: confirmed, conciliado: confirmed && overrides.reconciled },
    confirmado: confirmed,
    conciliado: confirmed && overrides.reconciled,
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
  if (overrides.scheduled) {
    keepUnconfirmed(payload, existing, ['dataEfetiva', 'valorEfetivo', 'valorEfetivoT']);
  }
  return payload;
}

export async function updateAction(id: string, options: UpdateOptions): Promise<void> {
  const entryId = Number(id);
  if (Number.isNaN(entryId)) {
    exitWithError('Invalid entry ID. Must be a number.');
  }

  // Validate options that need resolution before fetching entry
  let categoryId: number | null = null;
  if (options.category !== undefined) {
    categoryId = await resolveId('categories', options.category);
    if (categoryId === null) {
      exitWithError(`Unknown category: ${options.category}`);
    }
  }

  let tagIds: number[] | undefined;
  if (options.tags !== undefined) {
    const tagResult = await resolveIds('tags', options.tags);
    if (tagResult.unresolved.length > 0) {
      exitWithError(`Unknown tag(s): ${tagResult.unresolved.join(', ')}`);
    }
    tagIds = tagResult.ids;
  }

  let value: number | undefined;
  if (options.value !== undefined) {
    value = Number(options.value);
    if (Number.isNaN(value)) {
      exitWithError('Invalid value. Must be a number.');
    }
  }

  const hasChanges = options.description !== undefined ||
    options.value !== undefined ||
    options.type !== undefined ||
    options.category !== undefined ||
    options.date !== undefined ||
    options.tags !== undefined ||
    options.notes !== undefined ||
    options.pending ||
    options.reconciled;

  if (!hasChanges) {
    exitWithError('No changes specified. Use options like --description, --value, --date, etc.');
  }

  // Fetch existing entry
  const existing = await fetchEntry(entryId);
  const todos = resolveSeriesScope(entryId, existing, options.scope, {
    thisOnlyWarning: `Entry ${entryId} is an occurrence of a recurring series (${existing.parcela}): only this occurrence will be changed, and it will leave the series. Use --scope following to change this and the following occurrences, or --scope this to silence this warning.`,
  });
  const scheduled = staysScheduled(options, existing);

  if (existing.tipo === 't') {
    if (options.type !== undefined) {
      const requestedType = parseTypeOption(options.type);
      if (requestedType === undefined) {
        exitWithError(`Unknown type: ${options.type}. Valid: expense, income, transfer`);
      }
      if (requestedType !== 't') {
        exitWithError('A transfer cannot be turned into an expense or an income. Delete it and create the entry you want.');
      }
    }

    const payload = buildTransferPayload(entryId, existing, {
      description: options.description,
      value,
      date: options.date,
      categoryId,
      tagIds,
      notes: options.notes,
      reconciled: resolveReconciled(options, existing),
      scheduled,
    });
    if (todos !== undefined) payload.todos = todos;

    const transferResponse = await updateEntry(entryId, payload as unknown as UpdateEntryPayload);
    reportUpdate(transferResponse, options.json, todos);
    return;
  }

  // Echo the whole entry back and layer the changes on top. The API rejects
  // the PUT when a field it sent us is missing from the payload, and an
  // installment carries fields the CLI never modeled - parcela, agendaId,
  // plastico, dataCompetencia, categoriaPai - so rebuilding the payload field
  // by field made every installment impossible to edit. Keys below either
  // apply an option, supply a default, or reshape a value: id can arrive as a
  // string, and status arrives as a label but has to go back as an object.
  const payload: Record<string, unknown> = {
    ...existing,
    id: entryId,
    descricao: options.description ?? existing.descricao,
    status: {
      confirmado: !scheduled,
      conciliado: !scheduled && (existing.conciliado ?? false),
    },
    tipo: options.type ? mapTypeToApi(options.type) : existing.tipo,
    valor: value ?? existing.valor,
    valorPrevisto: value ?? existing.valorPrevisto ?? existing.valor,
    valorEfetivo: value ?? existing.valorEfetivo ?? existing.valor,
    dataPrevista: options.date ?? existing.dataPrevista,
    dataEfetiva: options.date ?? existing.dataEfetiva ?? existing.dataPrevista,
    exibirCp: existing.exibirCp ?? true,
    exibirCr: existing.exibirCr ?? true,
    estorno: existing.estorno ?? false,
    categoria: categoryId ?? existing.categoria ?? null,
    tags: tagIds ?? existing.tags ?? [],
    observacoes: options.notes ?? existing.observacoes ?? '',
    ndocumento: existing.ndocumento ?? '',
    lembrete: existing.lembrete ?? 0,
    automatico: existing.automatico ?? false,
    metaEconomia: null,
    transferencia: existing.transferencia ?? false,
  };

  // categoriaPai is the parent of categoria, and the categories endpoint does
  // not expose the parent, so a new category leaves us unable to recompute it.
  // Drop the stale one and let the server derive it.
  if (categoryId !== null) {
    delete payload.categoriaPai;
  }

  if (scheduled) {
    keepUnconfirmed(payload, existing, ['dataEfetiva', 'valorEfetivo']);
    // Moving a scheduled occurrence moves its schedule along with it (what
    // the tested reference patch for #65 sent).
    if (existing.agenda && options.date) {
      payload.agenda = { ...existing.agenda, primeiraData: options.date };
    }
  }
  // todos: true is the web app's "Neste e em todos na sequência": the server
  // applies the change to this and the following occurrences and splits the
  // series, leaving earlier ones untouched. false is "Apenas neste".
  if (todos !== undefined) payload.todos = todos;

  // Handle status changes
  if (options.pending) {
    payload.status = { confirmado: true, conciliado: false };
    payload.conciliado = false;
  } else if (options.reconciled) {
    payload.status = { confirmado: true, conciliado: true };
    payload.conciliado = true;
  }

  const response = await updateEntry(entryId, payload as unknown as UpdateEntryPayload);
  reportUpdate(response, options.json, todos);
}
