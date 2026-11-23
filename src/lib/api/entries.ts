import type { EntriesResponse, EntriesParams, CreateEntryPayload, CreateEntryResponse, UpdateEntryPayload, UpdateTransferPayload, Entry } from '../../types/index.js';
import { setEntriesPreferences } from '../entries-preferences.js';
import { request } from './request.js';
import { loadSessionPreferences } from './session.js';

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
  setEntriesPreferences(queryParams, await loadSessionPreferences());

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

  if (params.regime) queryParams.set('regime', params.regime);

  if (params.keywords) {
    queryParams.set('palavras', params.keywords);
  }

  if (params.value !== undefined) {
    queryParams.set('valor', params.value.toString());
  }

  return request<EntriesResponse>('GET', `/v2/lancamentos?${queryParams.toString()}`);
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
