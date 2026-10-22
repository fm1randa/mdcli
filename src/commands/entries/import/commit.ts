import {
  conciliateBankTransactions,
  importBankTransactions,
  markBankTransactionsImported,
} from '../../../lib/api.js';
import type { ImportDocument } from './document.js';
import type { RunDocument } from './plan.js';
import { asRecord, idOrNull } from '../../../lib/payload.js';

/** The web app's source label for an automatic bank import. */
const SOURCE = 'Importado via Integração bancária automática';
/** The web app commits 200 items per page. */
const PAGE_SIZE = 200;
/** Candidate Entry fields the web repeats when it links a Bank Transaction (`ids`, never `agrupar`). */
const LINKED_FIELDS = ['valor', 'centro', 'contato', 'projeto', 'categoria', 'ndocumento', 'descricao', 'tags'];

export interface CommitInput {
  run: RunDocument;
  document: ImportDocument;
  /** The raw statement rows, row for row with `document.transactions`. */
  statementRows: readonly unknown[];
  /** The raw Entries (or invoice items) the candidates came from. */
  candidateRows: readonly unknown[];
  creditCard: boolean;
}

interface CommitItem {
  action: 'import' | 'conciliate' | 'reject';
  integrationId: string;
  date: string;
  /** The new Entry (import) or the linked item (conciliate). */
  payload: Record<string, unknown> | null;
}

/**
 * Writes the run like the web: pages of 200 in date order; each page posts markImported,
 * then conciliacao, then importar. A failed markImported is reported and the page goes on.
 * A failed conciliacao or importar stops the import and says how many pages were written.
 */
export async function commitRun(input: CommitInput): Promise<void> {
  const items = commitItems(input).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pages: CommitItem[][] = [];
  for (let start = 0; start < items.length; start += PAGE_SIZE) pages.push(items.slice(start, start + PAGE_SIZE));

  const { run } = input;
  const markErrors: string[] = [];
  for (const [index, page] of pages.entries()) {
    const maxDate = page.reduce((max, item) => (item.date > max ? item.date : max), page[0].date);
    const ids = page.filter((item) => item.action !== 'conciliate').map((item) => item.integrationId);
    if (ids.length > 0) {
      try {
        await markBankTransactionsImported({ account: run.connectionAccount, ids, date: maxDate });
      } catch (error) {
        const message = `markImported failed: ${errorMessage(error)}`;
        console.error(message);
        markErrors.push(message);
        run.markImportedError = markErrors.join('\n');
      }
    }
    try {
      await conciliateBankTransactions({
        sobrescrever: run.overwrite.value,
        sobrescreverDescr: run.overwrite.description,
        inicio: run.statement.start,
        fim: run.statement.end,
        saldo: run.statement.balance,
        conta: run.accountId,
        lancamentos: payloads(page, 'conciliate'),
        considerarObservacoes: false,
        connectionAccount: run.connectionAccount,
        maxDate,
        fonte: SOURCE,
      });
      await importBankTransactions({
        lancamentos: payloads(page, 'import'),
        connectionAccount: run.connectionAccount,
        maxDate,
        fonte: SOURCE,
        importId: Date.now(),
      });
    } catch (error) {
      throw new Error(
        `${errorMessage(error)} Pages written before the failure: ${index} of ${pages.length}.`,
        { cause: error },
      );
    }
  }
}

function commitItems(input: CommitInput): CommitItem[] {
  const { run, document } = input;
  const bankDate = (integrationId: string): string => {
    const row = document.transactions.find((item) => item.integrationId === integrationId);
    if (row?.date == null) throw new Error(`Bank transaction ${integrationId} has no date.`);
    return row.date;
  };
  const items: CommitItem[] = [];
  for (const item of run.imported) {
    const index = document.transactions.findIndex((row) => row.integrationId === item.integrationId);
    const raw = asRecord(input.statementRows[index]);
    const reconciled = item.status === 'reconciled';
    const entry: Record<string, unknown> = {
      integrationId: item.integrationId,
      moeda: raw?.moeda,
      descricao: item.description,
      conta: run.accountId,
      categoria: item.categoryId,
      tags: item.tagIds,
      confirmado: reconciled,
      conciliado: reconciled,
      // Card: the purchase date is the competence date. dataPrevista/dataEfetiva stay out (open question).
      [input.creditCard ? 'dataCompetencia' : 'dataPrevista']: item.date,
      valorPrevisto: item.value,
    };
    if (reconciled) {
      if (!input.creditCard) entry.dataEfetiva = item.date;
      entry.valorEfetivo = item.value;
    }
    items.push({ action: 'import', integrationId: item.integrationId, date: item.date, payload: withoutNulls(entry) });
  }
  for (const item of run.conciliated) {
    const date = bankDate(item.integrationId);
    const entry = input.candidateRows.map(asRecord).find((row) => idOrNull(row?.id) === item.entryId) ?? null;
    const linked: Record<string, unknown> = { data: date };
    for (const field of LINKED_FIELDS) linked[field] = entry?.[field];
    linked.ids = [item.entryId];
    items.push({ action: 'conciliate', integrationId: item.integrationId, date, payload: withoutNulls(linked) });
  }
  for (const item of run.rejected) {
    items.push({ action: 'reject', integrationId: item.integrationId, date: bankDate(item.integrationId), payload: null });
  }
  return items;
}

function payloads(page: readonly CommitItem[], action: CommitItem['action']): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = [];
  for (const item of page) {
    if (item.action === action && item.payload !== null) list.push(item.payload);
  }
  return list;
}

/** The web does not send null fields, nor fields whose name starts with `$`. */
function withoutNulls(record: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && !key.startsWith('$')) clean[key] = value;
  }
  return clean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
