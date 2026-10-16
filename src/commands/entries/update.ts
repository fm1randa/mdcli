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
import { buildTransferPayload, clearEffective, keepUnconfirmed } from './update-transfer.js';

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
  scheduled?: boolean;
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
  if (options.scheduled) return true;
  return existing.status === 'agendado' && !options.pending && !options.reconciled;
}

function resolveReconciled(options: UpdateOptions, existing: Entry): boolean {
  if (options.pending) return false;
  if (options.reconciled) return true;
  return existing.conciliado ?? false;
}

export async function updateAction(id: string, options: UpdateOptions): Promise<void> {
  const entryId = Number(id);
  if (Number.isNaN(entryId)) {
    exitWithError('Invalid entry ID. Must be a number.');
  }

  if (options.scheduled && (options.pending || options.reconciled)) {
    exitWithError('Use only one of --scheduled, --pending and --reconciled.');
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
    options.reconciled ||
    options.scheduled;

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
      unconfirm: Boolean(options.scheduled),
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

  if (options.scheduled) {
    payload.conciliado = false;
    clearEffective(payload, ['dataEfetiva', 'valorEfetivo']);
  } else if (scheduled) {
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
