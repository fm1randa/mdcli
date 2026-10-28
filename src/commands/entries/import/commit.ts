import {
  conciliateBankTransactions,
  importBankTransactions,
  markBankTransactionsImported,
} from '../../../lib/api.js';
import { addInterval, compareDates } from '../../../lib/dates.js';
import { t } from '../../../lib/i18n/index.js';
import type { ImportDocument } from './document.js';
import type { RunDocument } from './plan.js';
import { asRecord, textOrNull } from '../../../lib/payload.js';

/** The web app's source label for an automatic bank import. */
const SOURCE = 'Importado via Integração bancária automática';
/** The web app commits 200 rows of the statement per page (`Ue`, mdb.js 21190). */
const PAGE_SIZE = 200;
/**
 * The window the web implies when the Connection has no `markImportedWindowDays`: moment's
 * `subtract(undefined, 'days')` is a no-op, so only the rows on the page's latest date are marked.
 */
const DEFAULT_WINDOW_DAYS = 0;
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
  /** The Connection's `markImportedWindowDays`, read like the web; null when the Connection did not send it. */
  markImportedWindowDays: number | null;
}

interface CommitItem {
  action: 'import' | 'conciliate' | 'reject';
  integrationId: string;
  date: string;
  /** The new Entry (import) or the linked item (conciliate). */
  payload: Record<string, unknown> | null;
}

/** A loaded statement row the web marks as imported, whatever the run does with it. */
interface PageRow {
  integrationId: string | null;
  date: string;
}

/**
 * Writes the run like the web: the statement in pages of 200 in date order, and each page posts
 * markImported with every row of the page inside the Connection's window, then conciliacao and
 * importar. A failed markImported is reported and the page goes on.
 * A failed conciliacao or importar stops the import and says how many pages were written.
 */
export async function commitRun(input: CommitInput): Promise<void> {
  const items = commitItems(input).sort((a, b) => compareDates(a.date, b.date));
  // The web pages over the whole statement, not over what the run writes: `lancamentosPagina` is
  // `extrato.lancamentos.slice(dt, dt + 200)` (mdb.js 21431-21436), and the confirmation dialog marks
  // every row of the page, ignored and invalid ones included (`u.lancamentos.map(D => D.e)`, 20965-20968).
  const rows = pageRows(input.document);
  const pages: PageRow[][] = [];
  for (let start = 0; start < rows.length; start += PAGE_SIZE) pages.push(rows.slice(start, start + PAGE_SIZE));
  if (pages.length === 0) return;
  const windowDays = input.markImportedWindowDays ?? DEFAULT_WINDOW_DAYS;
  const pageItems = itemsByPage(items, rows, pages.length);

  const { run } = input;
  const markErrors: string[] = [];
  for (const [index, page] of pages.entries()) {
    const maxDate = page.reduce((max, row) => (row.date > max ? row.date : max), page[0].date);
    const floor = addInterval(maxDate, -windowDays, 'd');
    const ids = page
      .filter((row) => row.integrationId !== null && row.date >= floor)
      .map((row) => row.integrationId as string);
    if (ids.length > 0) {
      try {
        await markBankTransactionsImported({ account: run.connectionAccount, ids, date: maxDate });
      } catch (error) {
        const message = t('errorMarkImportedFailed', errorMessage(error));
        console.error(message);
        markErrors.push(message);
        run.markImportedError = markErrors.join('\n');
      }
    }
    const pageRun = pageItems[index];
    try {
      await conciliateBankTransactions({
        sobrescrever: run.overwrite.value,
        sobrescreverDescr: run.overwrite.description,
        inicio: run.statement.start,
        fim: run.statement.end,
        saldo: run.statement.balance,
        conta: run.accountId,
        lancamentos: payloads(pageRun, 'conciliate'),
        considerarObservacoes: false,
        connectionAccount: run.connectionAccount,
        maxDate,
        fonte: SOURCE,
      });
      await importBankTransactions({
        lancamentos: payloads(pageRun, 'import'),
        connectionAccount: run.connectionAccount,
        maxDate,
        fonte: SOURCE,
        // eslint-disable-next-line local/no-ambient-clock -- unique id in ms, as the web stamps it, not a calendar day
        importId: Date.now(),
      });
    } catch (error) {
      throw new Error(
        t('errorPagesWritten', errorMessage(error), index, pages.length),
        { cause: error },
      );
    }
  }
}

/**
 * The loaded statement rows the web pages over, in the web's order: ascending by date
 * (`extrato.lancamentos.sort`, mdb.js 21335-21339), rows without a date left out because the
 * web's page date and window cannot place them.
 */
function pageRows(document: ImportDocument): PageRow[] {
  const rows: PageRow[] = [];
  for (const transaction of document.transactions) {
    if (transaction.date === null) continue;
    rows.push({ integrationId: transaction.integrationId, date: transaction.date });
  }
  return rows.sort((a, b) => compareDates(a.date, b.date));
}

/**
 * Each written item on the page its row fell on. An item the statement gave no dated row
 * (no `integrationId`) goes on the last page, so no write is dropped.
 */
function itemsByPage(items: readonly CommitItem[], rows: readonly PageRow[], pageCount: number): CommitItem[][] {
  const pageOf = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.integrationId !== null && !pageOf.has(row.integrationId)) pageOf.set(row.integrationId, Math.floor(index / PAGE_SIZE));
  });
  const byPage: CommitItem[][] = Array.from({ length: pageCount }, () => []);
  for (const item of items) byPage[pageOf.get(item.integrationId) ?? pageCount - 1].push(item);
  return byPage;
}

function commitItems(input: CommitInput): CommitItem[] {
  const { run, document } = input;
  const bankDate = (integrationId: string): string => {
    const row = document.transactions.find((item) => item.integrationId === integrationId);
    if (row?.date == null) throw new Error(t('errorBankTransactionNoDate', integrationId));
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
  return error instanceof Error ? error.message : t('unknownError');
}
