import type { Account, AccountBalanceSum } from '../../types/index.js';
import { getAuth } from '../config.js';
import { fetchWebBalances } from '../account-balances.js';
import { loadEntriesPreferences, type EntriesPreferences } from '../entries-preferences.js';
import { loadWebConfig, type WebConfig } from '../web-session.js';
import { request } from './request.js';
import { fetchAccounts } from './registry.js';

// Read once per run: the entries preferences, the account restrictions and the import overwrite preference share it.
let webConfig: Promise<WebConfig | null> | null = null;

/** The web's window.mdconfig, or null when the session state cannot give it (src/lib/web-session.ts). */
export function fetchWebConfig(): Promise<WebConfig | null> {
  return (webConfig ??= loadWebConfig((endpoint) => request('GET', endpoint), getAuth()?.uid));
}

let entriesPreferences: Promise<EntriesPreferences> | null = null;

/** Session preferences every lancamentos read merges. Loaded once per run. */
export const loadSessionPreferences = (accounts?: Promise<Account[]>): Promise<EntriesPreferences> => (entriesPreferences ??= loadEntriesPreferences(fetchWebConfig(), accounts ?? fetchAccounts().then((r) => r.items)));

/** The web's account balances (src/lib/account-balances.ts); `accounts`: every account of the user. */
export const fetchAccountBalances = (accounts: Account[], end: string): Promise<AccountBalanceSum[]> =>
  fetchWebBalances((endpoint) => request('GET', endpoint), accounts, end, () => loadSessionPreferences(Promise.resolve(accounts)), fetchWebConfig);
