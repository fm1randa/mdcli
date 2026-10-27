import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { updateEntry, fetchEntry } from '../../lib/api.js';
import { resolveTags } from './tags.js';
import { describeCategoryTypeMismatch, findCategory, resolveEntryCategory } from './category.js';
import type { Category, CreateEntryResponse, Entry, UpdateEntryPayload } from '../../types/index.js';
import { parseEntryType, warnScheduledAlias } from './create.js';
import { describeStatus } from './format.js';
import { formatCurrency } from '../../utils/currency.js';
import { describeScope, resolveSeriesScope, type SeriesScope } from './series.js';
import { buildTransferPayload, clearEffective, keepUnconfirmed } from './update-transfer.js';
import { parseEntryId } from './entry-id.js';
import { buildEntryStatus } from './status.js';
import { parseAmount } from '../../utils/parse.js';
import { resolveAccountOrExit } from '../account-id.js';
import { moveEntry, moveTransfer } from './update-account.js';

/** The type rules outcome for an ordinary (non-transfer) entry. */
interface ResolvedEntryType {
  /** The final tipo the entry will be saved with: d, r, or p. */
  tipo: 'd' | 'r' | 'p';
  /** The sign to apply to value fields: +1 for r, -1 for d, 0 for p (keep as-is). */
  sign: 1 | -1 | 0;
  /** Whether estorno should be false (type chosen/changed) or preserve existing. */
  estorno: boolean;
}

/**
 * Resolves the final entry type, sign, and estorno for an ordinary entry,
 * applying the web app rules (md.js filterCats/changeTipo/Tt):
 * - final type = -T > new category's type > current type (except p is locked)
 * - sign = +1 for r, -1 for d (p keeps its own sign)
 * - estorno = false when -T is given OR type changes; else keep existing
 * Validates category-type mismatches and refuses transfers before PUT.
 */
async function resolveEntryType(
  entryId: number,
  existing: Entry,
  requestedType: 'd' | 'r' | 't' | undefined,
  replacementCategory: { id: number; category: Category | null } | null,
  findCategory: (id: number) => Promise<Category | null>,
): Promise<ResolvedEntryType> {
  const newCategory = replacementCategory?.category ?? null;

  // Invoice payments (tipo p) are locked: cannot change type, only transfer category.
  if (existing.tipo === 'p') {
    if (requestedType !== undefined) {
      exitWithError('An invoice payment cannot be turned into an expense, income, or transfer. Change it in the web app.');
    }
    if (newCategory !== null && newCategory.tipo !== 't') {
      exitWithError(`Invoice payment ${entryId} needs a transfer category. Change it in the web app.`);
    }
  }

  // An ordinary entry cannot become a transfer: it would carry tipo t with no
  // destination account, and update refuses such an entry ever after.
  if (requestedType === 't') {
    exitWithError(
      `Entry ${entryId} is not a transfer. A transfer needs two accounts and is saved as a pair, so an entry cannot become one: ` +
      'delete it and create the transfer with: mdcli entries create -T transfer --to-account <id>.'
    );
  }
  if (newCategory?.tipo === 't' && existing.tipo !== 'p') {
    exitWithError(
      `Category "${newCategory.nome}" (${newCategory.id}) only classifies transfers, and entry ${entryId} is not a transfer. ` +
      "Use -c with a category of the entry's type (see: mdcli categories list --active)."
    );
  }

  // Final type: -T > new category's type > current type (p is handled above).
  const currentTipo = existing.tipo ?? 'd';
  const finalType = existing.tipo === 'p' ? 'p' : (requestedType ?? newCategory?.tipo ?? currentTipo) as 'd' | 'r' | 'p';
  if ((finalType === 'd' || finalType === 'r') && newCategory !== null && newCategory.tipo !== finalType) {
    exitWithError(describeCategoryTypeMismatch(newCategory, finalType));
  }
  // -T alone must agree with the category the entry already has (web app rule).
  const hasReplacementCategory = replacementCategory !== null;
  if (
    (requestedType === 'd' || requestedType === 'r') &&
    !hasReplacementCategory &&
    existing.categoria !== undefined
  ) {
    const current = existing.categoria !== undefined && existing.categoria !== null ? await findCategory(existing.categoria) : null;
    if (current !== null && current.tipo !== requestedType) {
      exitWithError(describeCategoryTypeMismatch(current, requestedType));
    }
  }

  // Web app signs value from type: r -> +1, d -> -1. Payment (p) keeps its sign.
  const sign = finalType === 'r' ? 1 : finalType === 'd' ? -1 : 0;
  // estorno = false when -T given OR type changes; else preserve existing.
  const estorno = (requestedType !== undefined || finalType !== (existing.tipo ?? 'd')) ? false : existing.estorno ?? false;

  return { tipo: finalType, sign, estorno };
}

interface UpdateOptions {
  account?: string;
  toAccount?: string;
  description?: string;
  value?: string;
  type?: string;
  category?: string;
  date?: string;
  tags?: string;
  notes?: string;
  pending?: boolean;
  confirmed?: boolean;
  reconciled?: boolean;
  /** Deprecated alias of --pending. */
  scheduled?: boolean;
  scope?: SeriesScope;
  json?: boolean;
}

/** The accounts --account/--to-account set, shown after the save. */
interface MovedAccounts {
  origin: number;
  /** Transfers only. */
  destination?: number;
}

function reportUpdate(response: CreateEntryResponse, json?: boolean, todos?: boolean, moved?: MovedAccounts): void {
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
  if (moved) {
    console.log(`  ${chalk.gray('Account:')} ${moved.origin}`);
    if (moved.destination !== undefined) console.log(`  ${chalk.gray('To account:')} ${moved.destination}`);
  }
  console.log(`  ${chalk.gray('Status:')} ${describeStatus(response.status, response.dataPrevista ?? response.data)}`);
  if (todos !== undefined) {
    console.log(`  ${chalk.gray('Scope:')} ${describeScope(todos)}`);
  }
}

export async function updateAction(id: string, options: UpdateOptions): Promise<void> {
  const entryId = parseEntryId(id);

  const unconfirm = Boolean(options.pending || options.scheduled);
  if ([unconfirm, options.confirmed, options.reconciled].filter(Boolean).length > 1) {
    exitWithError('Use only one of --pending, --confirmed and --reconciled.');
  }
  if (options.scheduled) warnScheduledAlias();

  // Reject an invalid type before resolving any option through the API.
  const requestedType = options.type === undefined ? undefined : parseEntryType(options.type);

  // Validate options that need resolution before fetching entry
  const category = options.category !== undefined ? await resolveEntryCategory(options.category) : null;
  const categoryId = category?.id ?? null;

  const tagIds = options.tags !== undefined ? await resolveTags(options.tags) : undefined;
  const accountId = options.account !== undefined ? await resolveAccountOrExit(options.account) : undefined;
  const toAccountId = options.toAccount !== undefined ? await resolveAccountOrExit(options.toAccount) : undefined;

  let value: number | undefined;
  if (options.value !== undefined) {
    value = parseAmount(options.value);
    if (value === undefined) {
      exitWithError(`Invalid value "${options.value}". Use a number like 10, 10.50 or 10,50.`);
    }
  }

  const hasChanges = options.account !== undefined ||
    options.toAccount !== undefined ||
    options.description !== undefined ||
    options.value !== undefined ||
    options.type !== undefined ||
    options.category !== undefined ||
    options.date !== undefined ||
    options.tags !== undefined ||
    options.notes !== undefined ||
    options.pending ||
    options.confirmed ||
    options.reconciled ||
    options.scheduled;

  if (!hasChanges) {
    exitWithError('No changes specified. Use options like --description, --value, --date, etc.');
  }

  // Fetch existing entry
  const existing = await fetchEntry(entryId);
  // The web app disables the account selectors of an entry on a closed
  // invoice (editarLancamento.html, ng-disabled=!!vm.l.fatura).
  if ((accountId !== undefined || toAccountId !== undefined) && existing.fatura) {
    exitWithError(`Entry ${entryId} is on a closed invoice, so its account cannot be changed (the web app locks it too).`);
  }
  // The web app edits an invoice payment as a transfer (mdb.js, tipo == "t" ||
  // tipo == "p"), and one side of it is always the card being paid.
  if ((accountId !== undefined || toAccountId !== undefined) && existing.tipo === 'p') {
    exitWithError(`Entry ${entryId} is an invoice payment, and an invoice payment involves a credit card: change its accounts in the web app.`);
  }
  if (toAccountId !== undefined && existing.tipo !== 't') {
    exitWithError('--to-account only applies to transfers. Use --account to move the entry to another account.');
  }
  const todos = resolveSeriesScope(entryId, existing, options.scope, {
    thisOnlyWarning: `Entry ${entryId} is an occurrence of a recurring series (${existing.parcela}): only this occurrence will be changed, and it will leave the series. Use --scope following to change this and the following occurrences, or --scope this to silence this warning.`,
    detachedOccurrence: `Entry ${entryId} belongs to a recurring series (${existing.parcela}), but the server no longer links it to the series (like the first occurrence, or one already confirmed or reconciled), so it changes on its own. To change the series, use --scope following on a scheduled occurrence.`,
  });
  const choice = buildEntryStatus(
    { pending: unconfirm, confirmed: options.confirmed, reconciled: options.reconciled },
    { existing }
  );

  if (existing.tipo === 't') {
    if (requestedType !== undefined && requestedType !== 't') {
      exitWithError('A transfer cannot be turned into an expense or an income. Delete it and create the entry you want.');
    }

    const moved = accountId !== undefined || toAccountId !== undefined
      ? await moveTransfer(entryId, existing, accountId, toAccountId)
      : undefined;
    const payload = buildTransferPayload(entryId, existing, {
      ...moved,
      description: options.description,
      value,
      date: options.date,
      categoryId,
      tagIds,
      notes: options.notes,
      status: choice,
    });
    if (todos !== undefined) payload.todos = todos;

    const transferResponse = await updateEntry(entryId, payload);
    reportUpdate(transferResponse, options.json, todos, moved && { origin: moved.originId, destination: moved.destinationId });
    return;
  }

  const resolved = await resolveEntryType(
    entryId,
    existing,
    requestedType,
    category,
    findCategory,
  );
  const finalType = resolved.tipo;
  const sign = resolved.sign;
  const estorno = resolved.estorno;
  const signed = (amount: number): number => (sign === 0 ? amount : sign * Math.abs(amount));

  // Echo the whole entry back and layer the changes on top. The API rejects
  // the PUT when a field it sent us is missing from the payload, and an
  // installment carries fields the CLI never modeled - parcela, agendaId,
  // plastico, dataCompetencia, categoriaPai - so rebuilding the payload field
  // by field made every installment impossible to edit. Keys below either
  // apply an option, supply a default, or reshape a value: id can arrive as a
  // string, and status arrives as a label but has to go back as an object.
  const payload: UpdateEntryPayload = {
    ...existing,
    id: entryId,
    descricao: options.description ?? existing.descricao,
    status: { confirmado: choice.confirmado, conciliado: choice.conciliado },
    tipo: finalType,
    valor: signed(value ?? existing.valor),
    valorPrevisto: signed(value ?? existing.valorPrevisto ?? existing.valor),
    valorEfetivo: signed(value ?? existing.valorEfetivo ?? existing.valor),
    dataPrevista: options.date ?? existing.dataPrevista,
    dataEfetiva: options.date ?? existing.dataEfetiva ?? existing.dataPrevista,
    exibirCp: existing.exibirCp ?? true,
    exibirCr: existing.exibirCr ?? true,
    estorno,
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

  // The top-level conciliado is echoed from the entry unless a flag sets it.
  if (choice.explicit) payload.conciliado = choice.conciliado;
  if (choice.effective === 'clear') {
    clearEffective(payload, ['dataEfetiva', 'valorEfetivo']);
  } else if (choice.effective === 'keep') {
    keepUnconfirmed(payload, existing, ['dataEfetiva', 'valorEfetivo']);
    // Moving a scheduled occurrence moves its schedule along with it (what
    // the tested reference patch for #65 sent).
    if (existing.agenda && options.date) {
      payload.agenda = { ...existing.agenda, primeiraData: options.date };
    }
  }
  if (accountId !== undefined) {
    await moveEntry(payload, existing, accountId, {
      date: options.date,
      flags: { pending: unconfirm, confirmed: options.confirmed, reconciled: options.reconciled },
    });
  }
  // todos: true is the web app's "Neste e em todos na sequência": the server
  // applies the change to this and the following occurrences and splits the
  // series, leaving earlier ones untouched. false is "Apenas neste".
  if (todos !== undefined) payload.todos = todos;

  const response = await updateEntry(entryId, payload);
  reportUpdate(response, options.json, todos, accountId === undefined ? undefined : { origin: accountId });
}
