import type { ApiHeaders, AuthConfig, AuthMethod, CategoriesResponse, Category, CreateCategoryPayload, UpdateCategoryPayload, AccountsResponse, TagsResponse, EntriesResponse, EntriesParams, CreateEntryPayload, CreateEntryResponse, UpdateEntryPayload, Entry, CardInvoiceResponse, CardFutureResponse, Account, CreateAccountPayload, UpdateAccountPayload, CreateTagPayload, CreateTagResponse } from '../types/index.js';
import { getAuth, getAuthMethod, setAuth, getOpItem, invalidateNameCache } from './config.js';
import { popStaleNameCacheUse } from './cache-invalidation.js';
import { captureAuthHeadless } from './browser-auth.js';
import { extractSessionFromBrowser } from './browser-session/index.js';


export {
  normalizeCategories,
  normalizeAccounts,
  normalizeTags,
  normalizeEntries,
  normalizeCardEntries,
  normalizeCardInstallments,
} from './normalize.js';

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

async function fetchEntries(params: EntriesParams): Promise<EntriesResponse> {
  const contas = JSON.stringify({
    faturas: params.includeFaturas ?? true,
    ids: params.accountIds,
  });

  const list = JSON.stringify({
    sumPrevPages: true,
    orderBy: [{ t: 'data' }, { t: 'datac' }, { t: 'valor' }],
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 200,
  });

  const queryParams = new URLSearchParams({
    apenasMetasDefinidas: 'false',
    contas,
    fim: params.endDate,
    finalidade: '1',
    inicio: params.startDate,
    list,
    moeda: '1',
    ordenarMesmaData: '4',
    pendentesPresente: 'true',
    status: (params.status ?? 15).toString(),
    tipoLancamento: (params.entryType ?? 15).toString(),
    type: 'list',
  });

  if (params.categoryIds?.length) {
    queryParams.set('categorias', JSON.stringify({ ids: params.categoryIds.map(String) }));
  }

  if (params.tagIds?.length) {
    queryParams.set('tags', JSON.stringify({ ids: params.tagIds.map(String) }));
  }

  if (params.keywords) {
    queryParams.set('palavras', params.keywords);
  }

  if (params.value !== undefined) {
    queryParams.set('valor', params.value.toString());
  }

  return request<EntriesResponse>('GET', `/v2/lancamentos?${queryParams.toString()}`);
}

export function isCreditCard(account: Account): boolean {
  return account.tipo === 'CARTAOCREDITO';
}

export async function fetchAccountById(id: number): Promise<Account | undefined> {
  const response = await fetchAccounts();
  return response.items.find((a) => a.id === id);
}

export async function createEntry(payload: CreateEntryPayload): Promise<CreateEntryResponse> {
  return request<CreateEntryResponse>('POST', '/v1/lancamentos', payload);
}

export async function updateEntry(id: number, payload: UpdateEntryPayload): Promise<CreateEntryResponse> {
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
