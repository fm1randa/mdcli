import type { ApiHeaders, AuthConfig, AuthMethod, CategoriesResponse, Category, CreateCategoryPayload, UpdateCategoryPayload, AccountsResponse, AccountBalanceSum, TagsResponse, EntriesResponse, EntriesParams, CreateEntryPayload, CreateEntryResponse, UpdateEntryPayload, UpdateTransferPayload, Entry, CardInvoiceResponse, CardFutureResponse, CardPlastic, Account, CreateAccountPayload, UpdateAccountPayload, CreateTagPayload, CreateTagResponse } from '../types/index.js';
import { getAuth, getAuthMethod, setAuth, getOpItem, invalidateNameCache } from './config.js';
import { popStaleNameCacheUse } from './cache-invalidation.js';
import { captureAuthHeadless } from './browser-auth.js';
import { extractSessionFromBrowser } from './browser-session/index.js';
import { fetchWebBalances } from './account-balances.js';
import { loadEntriesPreferences, setEntriesPreferences, type EntriesPreferences } from './entries-preferences.js';
import { loadWebConfig, type WebConfig } from './web-session.js';


export { normalizeCategories, normalizeAccounts, normalizeCards, normalizeTags, normalizeEntries, normalizeCardEntries, normalizeCardInstallments } from './normalize.js';

const BASE_URL = process.env.MDCLI_API_URL ?? 'https://app.meudinheiroweb.com.br/api';

let refreshPromise: Promise<AuthConfig> | null = null;

function buildHeaders(auth: AuthConfig): ApiHeaders {
  const headers: ApiHeaders = {
    Mdapikey: auth.apiKey,
    Mduid: auth.uid,
  };
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
    headers.Cookie = `mdauthtoken0=${auth.token}`;
  }
  return headers;
}

async function reacquireAuth(): Promise<{ auth: AuthConfig; method: AuthMethod }> {
  const method = getAuthMethod();

  switch (method) {
    case 'browser-chrome':
      return { auth: await extractSessionFromBrowser({ browser: 'chrome' }), method };
    case 'browser-edge':
      return { auth: await extractSessionFromBrowser({ browser: 'edge' }), method };
    case 'browser-firefox':
      return { auth: await extractSessionFromBrowser({ browser: 'firefox' }), method };
    case '1password': {
      const opItem = getOpItem();
      if (opItem) {
        return { auth: await captureAuthHeadless(opItem), method };
      }
      break;
    }
  }

  // manual and browser-manual need a human in the loop, so there's nothing to retry automatically.
  throw new Error('The API rejected the saved credentials (401). Run "mdcli auth login" to re-authenticate.');
}

/** Refreshes auth once and shares the result: concurrent 401s (e.g. the
 * parallel lookups in entries loadNames) all wait for the same refresh and
 * then retry with the new credentials instead of failing. */
async function getRefreshedAuth(): Promise<AuthConfig> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // stderr: a refresh can fire inside --json/--csv commands, where
      // stdout must stay machine-readable.
      console.error('🔄 Credentials rejected, refreshing with the last login method...');
      const { auth: newAuth, method } = await reacquireAuth();
      setAuth(newAuth, method);
      console.error('✓ Credentials refreshed');
      return newAuth;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Shared response handling for every request: a failure invalidates a
 * possibly stale name-cache use and keeps the API's error body in the message;
 * an empty body (DELETE answers 204) resolves to undefined. `context` (method +
 * endpoint) goes into every error so a bad response points at its request. */
async function readResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new Error(`API request failed (${context}): ${response.status} ${response.statusText} - ${errorText}`);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`API returned invalid JSON (${context}): ${reason}`, { cause: error });
  }
}

function buildWriteHeaders(auth: AuthConfig): Record<string, string> {
  return {
    ...(buildHeaders(auth) as unknown as Record<string, string>),
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://app.meudinheiroweb.com.br',
    'Referer': 'https://app.meudinheiroweb.com.br/',
  };
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Shared auth + fetch + 401-retry + error handling for GET/POST/PUT/DELETE. */
async function request<T>(method: HttpMethod, endpoint: string, body?: unknown): Promise<T> {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Not authenticated. Run "mdcli auth login" first.');
  }

  const url = `${BASE_URL}${endpoint}`;
  const headersFor = (a: AuthConfig): Record<string, string> =>
    method === 'GET'
      ? (buildHeaders(a) as unknown as Record<string, string>)
      : buildWriteHeaders(a);

  const doFetch = (a: AuthConfig) =>
    fetch(url, {
      method,
      headers: headersFor(a),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const context = `${method} ${endpoint}`;
  const response = await doFetch(auth);

  if (response.status === 401) {
    // Refresh once (shared with concurrent 401s) and retry with the new credentials.
    const retried = await doFetch(await getRefreshedAuth());
    return readResponse<T>(retried, `${context}, after refresh`);
  }

  return readResponse<T>(response, context);
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return request<CategoriesResponse>('GET', '/v1/cadastros/categorias?meta=true&paginate=false');
}

export async function createCategory(payload: CreateCategoryPayload): Promise<Category> {
  return request<Category>('POST', '/v1/cadastros/categorias', payload);
}

export async function updateCategory(id: number, payload: UpdateCategoryPayload): Promise<Category> {
  return request<Category>('PUT', `/v1/cadastros/categorias/${id}`, payload);
}

export async function deleteCategory(id: number, moveEntriesToId: number): Promise<void> {
  return request<void>('DELETE', `/v1/cadastros/categorias/${id}?idDestino=${moveEntriesToId}`);
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  return request<AccountsResponse>('GET', '/v1/cadastros/contas?meta=true&paginate=false');
}

/** Connections only, untyped: callers read it field by field (src/lib/payload.ts). Does not request a Sync. */
export async function fetchConnections(): Promise<unknown> {
  return request<unknown>('GET', '/v1/integracao/connections');
}

/** Bank transactions for one connection account. Does not request a Sync. */
export async function fetchBankTransactions(connectionAccount: number, start: string): Promise<unknown> {
  const query = new URLSearchParams({ start });
  return request<unknown>('GET', `/v1/integracao/account/${connectionAccount}/transactions?${query.toString()}`);
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
    const items = Array.isArray(response?.list) ? response.list : [];
    collected.push(...items);
    if (items.length === 0) return collected;
    const total = response?.meta?.total;
    if (typeof total === 'number' && collected.length >= total) return collected;
  }
  throw new Error(
    `GET /v2/lancamentos still had candidates after ${MAX_CANDIDATE_PAGES} pages (${collected.length} entries). ` +
      'Narrow the search with --search-from and --search-to.',
  );
}

// Read once per run: the entries preferences and the import overwrite preference share it.
let webConfig: Promise<WebConfig | null> | null = null;

/** The web's window.mdconfig, or null when the session state cannot give it (src/lib/web-session.ts). */
export function fetchWebConfig(): Promise<WebConfig | null> {
  return (webConfig ??= loadWebConfig((endpoint) => request('GET', endpoint), getAuth()?.uid));
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
export async function requestSync(connectionId: number): Promise<void> {
  await request<unknown>('PUT', `/v1/integracao/connection/update/${connectionId}`, { force: true });
}

export async function createAccount(payload: CreateAccountPayload): Promise<Account> {
  return request<Account>('POST', '/v1/cadastros/contas', payload);
}

export async function updateAccount(id: number, payload: UpdateAccountPayload): Promise<Account> {
  return request<Account>('PUT', `/v1/cadastros/contas/${id}`, payload);
}

export async function deleteAccount(id: number): Promise<void> {
  return request<void>('DELETE', `/v1/cadastros/contas/${id}`);
}

export async function fetchTags(): Promise<TagsResponse> {
  return request<TagsResponse>('GET', '/v1/cadastros/tags?paginate=false');
}

export async function createTag(payload: CreateTagPayload): Promise<CreateTagResponse> {
  return request<CreateTagResponse>('POST', '/v1/cadastros/tags', payload);
}

export async function updateTag(id: number, payload: CreateTagPayload): Promise<CreateTagResponse> {
  return request<CreateTagResponse>('PUT', `/v1/cadastros/tags/${id}`, payload);
}

export async function deleteTag(id: number): Promise<void> {
  return request<void>('DELETE', `/v1/cadastros/tags/${id}`);
}

export async function fetchFirstInvoiceDate(cardId: number): Promise<string> {
  return request<string>('GET', `/v1/cartoes/${cardId}/primeiraFatura?id=${cardId}`);
}

export async function fetchCardInvoice(cardId: number, dueDate: string): Promise<CardInvoiceResponse> {
  return request<CardInvoiceResponse>('GET', `/v1/cartoes/${cardId}/fatura/${dueDate}?id=${cardId}&vencimento=${dueDate}`);
}

export async function fetchCardFuture(cardId: number): Promise<CardFutureResponse> {
  return request<CardFutureResponse>('GET', `/v1/cartoes/${cardId}/parcelasFuturas?id=${cardId}`);
}

export async function fetchEntry(id: number): Promise<Entry> {
  return request<Entry>('GET', `/v1/lancamentos/${id}`);
}

const ENTRIES_PAGE_SIZE = 200;
const MAX_ENTRIES_PAGES = 100;

/** Fetches every page of entries matching the filters. */
export async function fetchAllEntries(params: Omit<EntriesParams, 'page' | 'pageSize'>): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (let page = 1; page <= MAX_ENTRIES_PAGES; page++) {
    const response = await fetchEntries({ ...params, page, pageSize: ENTRIES_PAGE_SIZE });
    entries.push(...response.list);
    if (response.list.length === 0) {
      return entries;
    }
    const total = response.meta?.total;
    if (total !== undefined) {
      // The server may cap pageSize below what was requested, so a short page
      // alone does not mean the last page — only total does.
      if (entries.length >= total) {
        return entries;
      }
    } else if (response.list.length < ENTRIES_PAGE_SIZE) {
      return entries;
    }
  }
  throw new Error(
    `More than ${MAX_ENTRIES_PAGES * ENTRIES_PAGE_SIZE} entries match these filters. Narrow the date range or filters.`
  );
}

/** The user's preferences every list and sum carries (src/lib/entries-preferences.ts). */
const loadPreferences = (accounts: Promise<Account[]>) => loadEntriesPreferences(fetchWebConfig(), accounts);
// Loaded once per run: fetchAllEntries asks for many pages.
let entriesPreferences: Promise<EntriesPreferences> | null = null;

async function fetchEntries(params: EntriesParams): Promise<EntriesResponse> {
  const contas = JSON.stringify({ faturas: params.includeFaturas ?? true, ids: params.accountIds });

  const list = JSON.stringify({
    sumPrevPages: true,
    orderBy: [{ t: 'data' }, { t: 'datac' }, { t: 'valor' }],
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 200,
  });

  const queryParams = new URLSearchParams({
    contas,
    fim: params.endDate,
    finalidade: '1',
    inicio: params.startDate,
    list,
    ordenarMesmaData: '4',
    status: (params.status ?? 15).toString(),
    tipoLancamento: (params.entryType ?? 15).toString(),
    type: 'list',
  });
  setEntriesPreferences(queryParams, await (entriesPreferences ??= loadPreferences(fetchAccounts().then((r) => r.items))));

  if (params.categoryIds?.length) {
    queryParams.set('categorias', JSON.stringify({ ids: params.categoryIds.map(String) }));
  }

  if (params.tagIds?.length) {
    queryParams.set('tags', JSON.stringify({ ids: params.tagIds.map(String) }));
  }

  // Like the web app, only sent when the filter is on (absent = every kind).
  if (params.repetition !== undefined) {
    queryParams.set('tipoRepeticao', params.repetition.toString());
  }

  if (params.keywords) {
    queryParams.set('palavras', params.keywords);
  }

  if (params.value !== undefined) {
    queryParams.set('valor', params.value.toString());
  }

  return request<EntriesResponse>('GET', `/v2/lancamentos?${queryParams.toString()}`);
}

/** The web's account balances (src/lib/account-balances.ts); `accounts`: every account of the user. */
export const fetchAccountBalances = (accounts: Account[], end: string): Promise<AccountBalanceSum[]> =>
  fetchWebBalances((endpoint) => request('GET', endpoint), accounts, end, () => (entriesPreferences ??= loadPreferences(Promise.resolve(accounts))));

export function isCreditCard(account: Account): boolean {
  return account.tipo === 'CARTAOCREDITO';
}

export async function fetchAccountById(id: number): Promise<Account | undefined> {
  return (await fetchAccounts()).items.find((a) => a.id === id);
}

/** Every plastic of every card (the web app loads them with paginate=false). */
export async function fetchPlastics(): Promise<CardPlastic[]> {
  return request<CardPlastic[]>('GET', '/v1/cadastros/plasticos?paginate=false');
}

export async function createEntry(payload: CreateEntryPayload): Promise<CreateEntryResponse> {
  return request<CreateEntryResponse>('POST', '/v1/lancamentos', payload);
}

export async function updateEntry(id: number, payload: UpdateEntryPayload | UpdateTransferPayload): Promise<CreateEntryResponse> {
  return request<CreateEntryResponse>('PUT', `/v1/lancamentos/${id}`, payload);
}

/**
 * `todos` is the web app's delete scope, sent as a query parameter exactly
 * like its lancamentosService.delete does ($http.delete(url, { params: { todos } })):
 * true = this and the following occurrences of the series, false = only this one.
 */
export async function deleteEntry(id: number, todos?: boolean): Promise<void> {
  const query = todos === undefined ? '' : `?todos=${todos}`;
  return request<void>('DELETE', `/v1/lancamentos/${id}${query}`);
}
