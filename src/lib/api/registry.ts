import type { CategoriesResponse, Category, CreateCategoryPayload, UpdateCategoryPayload, AccountsResponse, TagsResponse, CardPlastic, Account, CreateAccountPayload, UpdateAccountPayload, CreateTagPayload, CreateTagResponse } from '../../types/index.js';
import { request } from './request.js';

// Cadastros: categories, accounts, tags and card plastics.

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

export function isCreditCard(account: Account): boolean {
  return account.tipo === 'CARTAOCREDITO';
}

export const fetchAccountById = async (id: number): Promise<Account | undefined> => (await fetchAccounts()).items.find((a) => a.id === id);

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

/** Every plastic of every card (the web app loads them with paginate=false). */
export async function fetchPlastics(): Promise<CardPlastic[]> {
  return request<CardPlastic[]>('GET', '/v1/cadastros/plasticos?paginate=false');
}
