import type {
  ApiHeaders,
  AuthConfig,
  CategoriesResponse,
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
  CreateTagPayload,
  CreateTagResponse,
} from '../types/index.js';
import { getAuth, setAuth, getOpItem } from './config.js';
import { captureAuthHeadless } from './browser-auth.js';
import { extractSessionFromBrowser } from './browser-session.js';

const BASE_URL = 'https://app.meudinheiroweb.com.br/api';

let isRefreshing = false;

function buildHeaders(auth: AuthConfig): ApiHeaders {
  return {
    Authorization: `Bearer ${auth.token}`,
    Cookie: `mdauthtoken0=${auth.token}`,
    Mdapikey: auth.apiKey,
    Mdpolicy: auth.policy,
    Mdsignature: auth.signature,
    Mduid: auth.uid,
  };
}

async function refreshAuthAndRetry<T>(
  requestFn: (auth: AuthConfig) => Promise<Response>
): Promise<T> {
  if (isRefreshing) {
    throw new Error('Authentication refresh already in progress');
  }

  isRefreshing = true;
  try {
    let newAuth: AuthConfig;

    try {
      console.log('🔄 Token expired, refreshing via browser session...');
      newAuth = await extractSessionFromBrowser({ browser: 'chrome' });
      setAuth(newAuth, 'browser-chrome');
      console.log('✓ Token refreshed successfully via browser session');
    } catch {
      const opItem = getOpItem();
      if (!opItem) {
        throw new Error(
          'Authentication expired. Browser session extraction failed and no 1Password item configured.\n' +
            'Run "mdcli auth login" to re-authenticate.'
        );
      }

      console.log('⚠ Browser session failed, falling back to 1Password...');
      newAuth = await captureAuthHeadless(opItem);
      setAuth(newAuth, '1password');
      console.log('✓ Token refreshed successfully via 1Password');
    }

    const response = await requestFn(newAuth);
    if (!response.ok) {
      throw new Error(`API request failed after refresh: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  } finally {
    isRefreshing = false;
  }
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
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json() as Promise<R>;
}

export async function fetchCategories(): Promise<CategoriesResponse> {
  return apiRequest<CategoriesResponse>('/v1/cadastros/categorias?meta=true&paginate=false');
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  return apiRequest<AccountsResponse>('/v1/cadastros/contas?meta=true&paginate=false');
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

export async function fetchEntries(params: EntriesParams): Promise<EntriesResponse> {
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

export function normalizeEntries(response: EntriesResponse): NormalizedEntry[] {
  return response.list.map((entry) => ({
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
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
}

export async function deleteEntry(id: number): Promise<void> {
  return apiDelete(`/v1/lancamentos/${id}`);
}
