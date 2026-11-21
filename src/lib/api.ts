// The API client, split by resource under src/lib/api/. This module keeps the
// names every caller imports; the request core (auth, headers, the shared
// 401 refresh) lives in src/lib/api/request.ts.
export { normalizeCategories, normalizeAccounts, normalizeCards, normalizeTags, normalizeEntries, normalizeCardEntries, normalizeCardInstallments, isActiveAccount, isSelectableAccount } from './normalize.js';
export { apiGet, apiPost } from './api/request.js';
export { fetchCategories, createCategory, updateCategory, deleteCategory, fetchAccounts, createAccount, updateAccount, deleteAccount, isCreditCard, fetchAccountById, fetchTags, createTag, updateTag, deleteTag, fetchPlastics } from './api/registry.js';
export { fetchWebConfig, loadSessionPreferences, fetchAccountBalances } from './api/session.js';
export { fetchFirstInvoice, fetchCardInvoice, fetchCardFuture } from './api/cards.js';
export { fetchConnections, fetchBankTransactions, fetchImportDuplicates, fetchImportCandidates, suggestCategoriesWithAi, markBankTransactionsImported, conciliateBankTransactions, importBankTransactions, requestSync } from './api/bank-import.js';
export { fetchEntry, fetchAllEntries, createEntry, updateEntry, deleteEntry } from './api/entries.js';
