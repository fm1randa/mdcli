import type {
  ApiHeaders,
  AuthConfig,
  AuthMethod,
  CategoriesResponse,
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  AccountsResponse,
  TagsResponse,
  EntriesResponse,
  EntriesParams,
  NormalizedCategory,
  NormalizedAccount,
  NormalizedTag,
  NormalizedEntry,
  CreateEntryPayload,
  CreateEntryResponse,
  UpdateEntryPayload,
  Entry,
  CardInvoiceResponse,
  CardFutureResponse,
  NormalizedCardEntry,
  NormalizedCardInstallment,
  Account,
  CreateAccountPayload,
  UpdateAccountPayload,
  CreateTagPayload,
  CreateTagResponse,
} from '../types/index.js';
import { getAuth, getAuthMethod, setAuth, getOpItem, invalidateNameCache } from './config.js';
import { popStaleNameCacheUse } from './cache-invalidation.js';
import { captureAuthHeadless } from './browser-auth.js';
import { extractSessionFromBrowser } from './browser-session.js';

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

async function refreshAuthAndRetry<T>(
  requestFn: (auth: AuthConfig) => Promise<Response>
): Promise<T> {
  const newAuth = await getRefreshedAuth();

  const response = await requestFn(newAuth);
  if (!response.ok) {
    // Same failure handling as the non-refresh paths: invalidate a possibly
    // stale name-cache use and keep the API's error body in the message.
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new Error(`API request failed after refresh: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return response.json() as Promise<T>;
}

async function apiRequest<T>(endpoint: string): Promise<T> {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Not authenticated. Run "mdcli auth login" first.');
  }

  const headers = buildHeaders(auth);
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: headers as unknown as Record<string, string>,
  });

  if (!response.ok) {
    if (response.status === 401) {
      return refreshAuthAndRetry<T>((newAuth) =>
        fetch(url, {
          method: 'GET',
          headers: buildHeaders(newAuth) as unknown as Record<string, string>,
        })
      );
    }
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function buildPostHeaders(auth: AuthConfig): Record<string, string> {
  return {
    ...(buildHeaders(auth) as unknown as Record<string, string>),
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://app.meudinheiroweb.com.br',
    'Referer': 'https://app.meudinheiroweb.com.br/',
  };
}

async function apiPost<T, R>(endpoint: string, body: T): Promise<R> {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Not authenticated. Run "mdcli auth login" first.');
  }

  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: buildPostHeaders(auth),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      return refreshAuthAndRetry<R>((newAuth) =>
        fetch(url, {
          method: 'POST',
          headers: buildPostHeaders(newAuth),
          body: JSON.stringify(body),
        })
      );
    }
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json() as Promise<R>;
}

async function apiPut<T, R>(endpoint: string, body: T): Promise<R> {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Not authenticated. Run "mdcli auth login" first.');
  }

  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: buildPostHeaders(auth),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      return refreshAuthAndRetry<R>((newAuth) =>
        fetch(url, {
          method: 'PUT',
          headers: buildPostHeaders(newAuth),
          body: JSON.stringify(body),
        })
      );
    }
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json() as Promise<R>;
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return apiRequest<CategoriesResponse>('/v1/cadastros/categorias?meta=true&paginate=false');
}

export async function createCategory(payload: CreateCategoryPayload): Promise<Category> {
  return apiPost<CreateCategoryPayload, Category>('/v1/cadastros/categorias', payload);
}

export async function updateCategory(id: number, payload: UpdateCategoryPayload): Promise<Category> {
  return apiPut<UpdateCategoryPayload, Category>(`/v1/cadastros/categorias/${id}`, payload);
}

export async function deleteCategory(id: number, moveEntriesToId: number): Promise<void> {
  return apiDelete(`/v1/cadastros/categorias/${id}?idDestino=${moveEntriesToId}`);
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  return apiRequest<AccountsResponse>('/v1/cadastros/contas?meta=true&paginate=false');
}

export async function createAccount(payload: CreateAccountPayload): Promise<Account> {
  return apiPost<CreateAccountPayload, Account>('/v1/cadastros/contas', payload);
}

export async function updateAccount(id: number, payload: UpdateAccountPayload): Promise<Account> {
  return apiPut<UpdateAccountPayload, Account>(`/v1/cadastros/contas/${id}`, payload);
}

export async function deleteAccount(id: number): Promise<void> {
  return apiDelete(`/v1/cadastros/contas/${id}`);
}

export async function fetchTags(): Promise<TagsResponse> {
  return apiRequest<TagsResponse>('/v1/cadastros/tags?paginate=false');
}

export async function createTag(payload: CreateTagPayload): Promise<CreateTagResponse> {
  return apiPost<CreateTagPayload, CreateTagResponse>('/v1/cadastros/tags', payload);
}

export async function updateTag(id: number, payload: CreateTagPayload): Promise<CreateTagResponse> {
  return apiPut<CreateTagPayload, CreateTagResponse>(`/v1/cadastros/tags/${id}`, payload);
}

export async function deleteTag(id: number): Promise<void> {
  return apiDelete(`/v1/cadastros/tags/${id}`);
}

export async function fetchFirstInvoiceDate(cardId: number): Promise<string> {
  return apiRequest<string>(`/v1/cartoes/${cardId}/primeiraFatura?id=${cardId}`);
}

export async function fetchCardInvoice(cardId: number, dueDate: string): Promise<CardInvoiceResponse> {
  return apiRequest<CardInvoiceResponse>(`/v1/cartoes/${cardId}/fatura/${dueDate}?id=${cardId}&vencimento=${dueDate}`);
}

export async function fetchCardFuture(cardId: number): Promise<CardFutureResponse> {
  return apiRequest<CardFutureResponse>(`/v1/cartoes/${cardId}/parcelasFuturas?id=${cardId}`);
}

export async function fetchEntry(id: number): Promise<Entry> {
  return apiRequest<Entry>(`/v1/lancamentos/${id}`);
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

  return apiRequest<EntriesResponse>(`/v2/lancamentos?${queryParams.toString()}`);
}

function mapCategoryType(tipo: 'd' | 'r' | 't'): 'expense' | 'income' | 'transfer' {
  const typeMap: Record<string, 'expense' | 'income' | 'transfer'> = {
    d: 'expense',
    r: 'income',
    t: 'transfer',
  };
  return typeMap[tipo] ?? 'expense';
}

export function normalizeCategories(response: CategoriesResponse): NormalizedCategory[] {
  return response.items.map((cat) => ({
    id: cat.id,
    name: cat.nome,
    type: mapCategoryType(cat.tipo),
    active: cat.status,
    system: cat.sistema,
  }));
}

export function normalizeAccounts(response: AccountsResponse): NormalizedAccount[] {
  return response.items.map((acc) => ({
    id: acc.id,
    name: acc.nome,
    type: acc.tipo,
    bank: acc.banco?.nome ?? null,
    balance: acc.saldoUltimoExtrato ?? acc.saldoInicial ?? 0,
    active: acc.status,
    closed: acc.encerrada,
  }));
}

export function normalizeTags(response: TagsResponse): NormalizedTag[] {
  return response.map((tag) => ({
    id: tag.id,
    name: tag.nome,
    color: `#${tag.cor}`,
    active: tag.status,
  }));
}

function mapEntryStatus(status: string): 'reconciled' | 'pending' | 'scheduled' {
  const statusMap: Record<string, 'reconciled' | 'pending' | 'scheduled'> = {
    conciliado: 'reconciled',
    pendente: 'pending',
    agendado: 'scheduled',
  };
  return statusMap[status] ?? 'pending';
}

export function normalizeEntries(entries: Entry[]): NormalizedEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    description: entry.descricao,
    date: entry.data,
    value: entry.valor,
    type: mapCategoryType(entry.tipo ?? 'd'),
    status: mapEntryStatus(entry.status),
    accountId: entry.conta,
    categoryId: entry.categoria ?? null,
    installment: entry.parcela ?? null,
  }));
}

export function normalizeCardEntries(response: CardInvoiceResponse): NormalizedCardEntry[] {
  return response.lancamentos.map((entry) => ({
    id: entry.id,
    description: entry.descricao,
    date: entry.data,
    value: entry.valor,
    categoryId: entry.categoria ?? null,
    installment: entry.parcela ?? null,
  }));
}

export function normalizeCardInstallments(response: CardFutureResponse): NormalizedCardInstallment[] {
  if (!response.parcelas || !Array.isArray(response.parcelas)) {
    return [];
  }
  return response.parcelas.map((item) => ({
    id: item.id,
    description: item.descricao,
    date: item.data,
    value: item.valor,
    installment: item.parcela,
    remaining: item.parcelasRestantes ?? 0,
    categoryId: item.categoria ?? null,
  }));
}

export function isCreditCard(account: Account): boolean {
  return account.tipo === 'CARTAOCREDITO';
}

export async function fetchAccountById(id: number): Promise<Account | undefined> {
  const response = await fetchAccounts();
  return response.items.find((a) => a.id === id);
}

export async function createEntry(payload: CreateEntryPayload): Promise<CreateEntryResponse> {
  return apiPost<CreateEntryPayload, CreateEntryResponse>('/v1/lancamentos', payload);
}

export async function updateEntry(id: number, payload: UpdateEntryPayload): Promise<CreateEntryResponse> {
  return apiPut<UpdateEntryPayload, CreateEntryResponse>(`/v1/lancamentos/${id}`, payload);
}

async function apiDelete(endpoint: string): Promise<void> {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Not authenticated. Run "mdcli auth login" first.');
  }

  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: buildPostHeaders(auth),
  });

  if (!response.ok) {
    if (response.status === 401) {
      await refreshAuthAndRetry<void>((newAuth) =>
        fetch(url, {
          method: 'DELETE',
          headers: buildPostHeaders(newAuth),
        })
      );
      return;
    }
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
}

export async function deleteEntry(id: number): Promise<void> {
  return apiDelete(`/v1/lancamentos/${id}`);
}
