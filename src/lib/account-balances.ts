import type { Account, AccountBalanceSum } from '../types/index.js';
import { setEntriesPreferences, type EntriesPreferences } from './entries-preferences.js';
import { asRecord, idOrNull, numberOrNull } from './payload.js';
import { t } from './i18n/index.js';
import type { WebConfig } from './web-session.js';

/**
 * The accounts the web's Saldos das contas panel asks a balance for
 * (contasService.carregarContasPR, mdb.js 4392-4399, called with K = true and
 * no Z at 63450): active or closed, neither a card nor an investment
 * portfolio, when moedaService has a currency, in that currency, and, for K,
 * not restricted to the user. The others get none.
 */
function hasWebBalance(account: Account, currency: number | undefined, restricted: (id: number) => boolean): boolean {
  return (
    (account.status || account.encerrada) &&
    account.tipo !== 'CARTAOCREDITO' &&
    account.tipo !== 'CARTEIRA_INVEST' &&
    (currency === undefined || account.moeda === currency) &&
    !restricted(account.id)
  );
}

/**
 * usuarioService.hasRest("contas", id) (mdb.js 60168-60188): an account is
 * restricted when its id is in usuario.permissoes.restricoes.contas, which may
 * hold the id as a number or a string; without that list no account is.
 */
function accountRestriction(config: WebConfig | null): (id: number) => boolean {
  const user = asRecord(config?.usuario);
  const ids = asRecord(asRecord(asRecord(user?.permissoes)?.restricoes))?.contas;
  if (!Array.isArray(ids)) return () => false;
  return (id) => ids.some((restricted) => idOrNull(restricted) === id);
}

/**
 * The web app's account balances (the Saldos de caixa / Saldos das contas
 * panels and the Lançamentos screen, mdb.js): the server sums every Entry of
 * each account the web shows a balance for up to `end`, with no start date,
 * grouped by account. Accounts without a web balance are not in the result.
 * `get` is the authenticated API GET; `accounts`, every account of the user;
 * `preferences`, the run's entries preferences, and `config`, the web's
 * window.mdconfig for the user's restrictions (both read only when some account
 * could have a balance, so a user with only cards reads nothing more).
 */
export async function fetchWebBalances(
  get: (endpoint: string) => Promise<unknown>,
  accounts: Account[],
  end: string,
  preferences: () => Promise<EntriesPreferences>,
  config: () => Promise<WebConfig | null>
): Promise<AccountBalanceSum[]> {
  if (!accounts.some((a) => hasWebBalance(a, undefined, () => false))) return [];
  const [prefs, mdconfig] = await Promise.all([preferences(), config()]);
  const restricted = accountRestriction(mdconfig);
  const ids = accounts.filter((a) => hasWebBalance(a, prefs.moeda, restricted)).map((a) => a.id);
  if (ids.length === 0) return [];

  const query = new URLSearchParams({ type: 'sum', finalidade: '1', fim: end });
  setEntriesPreferences(query, prefs);
  query.set('contas', JSON.stringify({ ids, faturas: true, residuo: false }));
  query.set('sum', JSON.stringify({ groupBy: 'conta' }));
  return parseBalanceSums(await get(`/v2/lancamentos?${query.toString()}`));
}

/** The rows of a type=sum answer; a body that is not { sum: [...] } of
 * numeric conta/projetado/confirmado fails with the endpoint named, instead of
 * a balance silently going missing or NaN downstream (#362). */
const SUM_CONTEXT = 'GET /v2/lancamentos type=sum';

function parseBalanceSums(body: unknown): AccountBalanceSum[] {
  const rows: unknown = asRecord(body)?.sum;
  const items: unknown[] = Array.isArray(rows) ? rows : [];
  const sums = items.flatMap((item): AccountBalanceSum[] => {
    const row = asRecord(item);
    const conta = numberOrNull(row?.conta);
    const projetado = numberOrNull(row?.projetado);
    const confirmado = numberOrNull(row?.confirmado);
    return conta !== null && projetado !== null && confirmado !== null ? [{ conta, projetado, confirmado }] : [];
  });
  if (!Array.isArray(rows) || sums.length !== items.length) throw new Error(t('errorApiUnexpectedBody', SUM_CONTEXT));
  return sums;
}
