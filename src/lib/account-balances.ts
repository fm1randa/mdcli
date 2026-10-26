import type { Account, AccountBalanceSum } from '../types/index.js';
import { setEntriesPreferences, type EntriesPreferences } from './entries-preferences.js';

/**
 * The accounts the web's Saldos das contas panel asks a balance for
 * (contasService.carregarContasPR, mdb.js 4392-4399, called with no Z at
 * 63450): active or closed, neither a card nor an investment portfolio, and,
 * when moedaService has a currency, in that currency. The others get none.
 */
function hasWebBalance(account: Account, currency: number | undefined): boolean {
  return (
    (account.status || account.encerrada) &&
    account.tipo !== 'CARTAOCREDITO' &&
    account.tipo !== 'CARTEIRA_INVEST' &&
    (currency === undefined || account.moeda === currency)
  );
}

/**
 * The web app's account balances (the Saldos de caixa / Saldos das contas
 * panels and the Lançamentos screen, mdb.js): the server sums every Entry of
 * each account the web shows a balance for up to `end`, with no start date,
 * grouped by account. Accounts without a web balance are not in the result.
 * `get` is the authenticated API GET; `accounts`, every account of the user;
 * `preferences`, the run's entries preferences (read only when some account
 * could have a balance, so a user with only cards reads nothing more).
 */
export async function fetchWebBalances(
  get: (endpoint: string) => Promise<unknown>,
  accounts: Account[],
  end: string,
  preferences: () => Promise<EntriesPreferences>
): Promise<AccountBalanceSum[]> {
  if (!accounts.some((a) => hasWebBalance(a, undefined))) return [];
  const prefs = await preferences();
  const ids = accounts.filter((a) => hasWebBalance(a, prefs.moeda)).map((a) => a.id);
  if (ids.length === 0) return [];

  const query = new URLSearchParams({ type: 'sum', finalidade: '1', fim: end });
  setEntriesPreferences(query, prefs);
  query.set('contas', JSON.stringify({ ids, faturas: true, residuo: false }));
  query.set('sum', JSON.stringify({ groupBy: 'conta' }));
  return ((await get(`/v2/lancamentos?${query.toString()}`)) as { sum: AccountBalanceSum[] }).sum;
}
