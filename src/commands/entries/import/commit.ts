import {
  conciliateBankTransactions,
  importBankTransactions,
  markBankTransactionsImported,
} from '../../../lib/api.js';
import { compareDates } from '../../../lib/dates.js';
import type { ImportDocument } from './document.js';
import type { RunDocument } from './plan.js';
import { asRecord, textOrNull } from '../../../lib/payload.js';

/** The web app's source label for an automatic bank import. */
const SOURCE = 'Importado via Integração bancária automática';
/** The web app commits 200 items per page. */
const PAGE_SIZE = 200;
/**
 * Statement row fields the web sends when it links a Bank Transaction (`g()`, mdb.js 21108-21119):
 * the row's own, not the linked Entry's nor the edited copy (`E.e`). The server applies them to the
 * Entry only when `sobrescrever`/`sobrescreverDescr` are on. `observacoes` needs config importArq.obs,
 * which is not read (`considerarObservacoes: false`); `agrupar` (N Entries) is never sent.
 */
const LINKED_FIELDS = ['valor', 'centro', 'contato', 'projeto', 'categoria', 'ndocumento', 'descricao', 'tags'];

export interface CommitInput {
  run: RunDocument;
  document: ImportDocument;
  /** The raw statement rows, row for row with `document.transactions`. */
  statementRows: readonly unknown[];
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
  const items = commitItems(input).sort((a, b) => compareDates(a.date, b.date));
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
        // A unique id in milliseconds, as the web stamps it, not a calendar day.
        // eslint-disable-next-line local/no-ambient-clock
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
  const statementRow = (integrationId: string): Record<string, unknown> | null => {
    const index = document.transactions.findIndex((row) => row.integrationId === integrationId);
    return asRecord(input.statementRows[index]);
  };
  const items: CommitItem[] = [];
  for (const item of run.imported) {
    const raw = statementRow(item.integrationId);
    const reconciled = item.status === 'reconciled';
    const entry: Record<string, unknown> = {
      integrationId: item.integrationId,
      // Bank fields the web copies from the statement row.
      moeda: raw?.moeda,
      nomePlastico: raw?.nomePlastico,
      descricao: item.description,
      conta: run.accountId,
      categoria: item.categoryId,
      tags: item.tagIds,
      // The web sets the type by the sign, and again after a sign flip.
      tipo: item.value < 0 ? 'd' : 'r',
      confirmado: reconciled,
      conciliado: reconciled,
      // On any account, as the web: the bank's competence date, else its date.
      dataCompetencia: textOrNull(raw?.dataCompetencia) ?? item.date,
      valorPrevisto: item.value,
    };
    // Card: no dataPrevista/dataEfetiva (approved premise, 2026-10-22).
    if (!input.creditCard) entry.dataPrevista = item.date;
    if (reconciled) {
      if (!input.creditCard) entry.dataEfetiva = item.date;
      entry.valorEfetivo = item.value;
    } else {
      // A future date (Scheduled) gets the web's default reminder.
      entry.lembrete = '0';
      entry.enviarLembrete = true;
    }
    items.push({ action: 'import', integrationId: item.integrationId, date: item.date, payload: webPayload(entry) });
  }
  for (const item of run.conciliated) {
    const date = bankDate(item.integrationId);
    const raw = statementRow(item.integrationId);
    const linked: Record<string, unknown> = { data: date };
    for (const field of LINKED_FIELDS) linked[field] = raw?.[field];
    linked.ids = [item.entryId];
    items.push({ action: 'conciliate', integrationId: item.integrationId, date, payload: webPayload(linked) });
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
function webPayload(record: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && !key.startsWith('$')) clean[key] = value;
  }
  return clean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
