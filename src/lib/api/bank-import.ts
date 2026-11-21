import type { ConnectionsResponse, BankStatementResponse, SyncRequestResponse } from '../../types/index.js';
import { t } from '../i18n/index.js';
import { request } from './request.js';

// Integration: bank connections, the Sync, and the import of Bank Transactions.

/** Connections only: callers still read it field by field (src/lib/payload.ts). Does not request a Sync. */
export async function fetchConnections(): Promise<ConnectionsResponse> {
  return request<ConnectionsResponse>('GET', '/v1/integracao/connections');
}

/** Bank transactions for one connection account. Does not request a Sync. */
export async function fetchBankTransactions(connectionAccount: number, start: string): Promise<BankStatementResponse> {
  const query = new URLSearchParams({ start });
  return request<BankStatementResponse>('GET', `/v1/integracao/account/${connectionAccount}/transactions?${query.toString()}`);
}

/** Possible duplicates for one Account between two dates. Does not write. */
export async function fetchImportDuplicates(accountId: number, start: string, end: string): Promise<unknown> {
  const query = new URLSearchParams({
    inicio: start,
    fim: end,
    conta: String(accountId),
  });
  return request<unknown>('GET', `/v1/lancamentos/duplicidade?${query.toString()}`);
}

const CANDIDATE_PAGE_SIZE = 500;
// Only a guard against a server that never stops paging: past it the search fails instead of truncating.
const MAX_CANDIDATE_PAGES = 200;

interface ImportCandidatePage {
  list?: unknown;
  meta?: { total?: unknown };
}

/**
 * One account, finalidade 3, pages of 500, until meta.total is covered or a page comes back empty.
 * Not fetchEntries: that query is finalidade 1.
 */
export async function fetchImportCandidates(accountId: number, start: string, end: string): Promise<unknown[]> {
  const collected: unknown[] = [];
  for (let page = 1; page <= MAX_CANDIDATE_PAGES; page++) {
    const query = new URLSearchParams({
      finalidade: '3',
      inicio: start,
      fim: end,
      contas: JSON.stringify({ ids: [accountId] }),
      list: JSON.stringify({ page, pageSize: CANDIDATE_PAGE_SIZE }),
    });
    const response = await request<ImportCandidatePage>('GET', `/v2/lancamentos?${query.toString()}`);
    const items: unknown[] = Array.isArray(response?.list) ? response.list : [];
    collected.push(...items);
    if (items.length === 0) return collected;
    const total = response?.meta?.total;
    if (typeof total === 'number' && collected.length >= total) return collected;
  }
  throw new Error(t('errorTooManyCandidates', MAX_CANDIDATE_PAGES, collected.length));
}

/** The web app's AI category suggestion. The answer is aligned with `tokens`: a Category id or null. */
export async function suggestCategoriesWithAi(tokens: unknown[]): Promise<unknown> {
  return request<unknown>('POST', '/v1/smartmatch/ai', { t: tokens });
}

/** Import commit, step 1: the Bank Transactions the server should stop offering. */
export async function markBankTransactionsImported(body: object): Promise<void> {
  await request<unknown>('POST', '/v1/integracao/transactions/markImported', body);
}

/** Import commit, step 2: links Bank Transactions to existing Entries and records the statement balance. */
export async function conciliateBankTransactions(body: object): Promise<void> {
  await request<unknown>('POST', '/v1/lancamentos/conciliacao', body);
}

/** Import commit, step 3: creates the new Entries. The answer is not read (its format is unknown). */
export async function importBankTransactions(body: object): Promise<void> {
  await request<unknown>('POST', '/v1/lancamentos/importar', body);
}

/** One manual Sync. The body is the web app's sync button; there is no local daily counter. */
export async function requestSync(connectionId: number): Promise<SyncRequestResponse | undefined> {
  return request<SyncRequestResponse | undefined>('PUT', `/v1/integracao/connection/update/${connectionId}`, { force: true });
}
