import type { Account } from '../types/index.js';

/** The user as GET /frontend/sessao reports it (the web's window.mdconfig.usuario). */
interface SessionUser {
  conta?: { config?: { pendentesPresente?: boolean; metasRD?: boolean; moeda?: number } };
  config?: { mdweb?: { moeda?: { m?: number } } };
}

/** The params the web adds to every GET /v2/lancamentos; undefined = not sent. */
export interface EntriesPreferences {
  pendentesPresente?: boolean;
  apenasMetasDefinidas?: boolean;
  moeda?: number;
}

/**
 * What relatoriosDatasource G (mdb.js 44174-44183) adds to every list and sum:
 * pendentesPresente and apenasMetasDefinidas from c.utilizacao, which is
 * usuario.conta.config (configuracoesService, mdb.js 49687-49689), and moeda
 * from moedaService (mdb.js 17331-17349, 17400-17402): the currency picked in
 * the web (config.mdweb.moeda.m, else the account's default) when an active
 * account that is not an investment portfolio uses it, else the first of those
 * accounts' currencies, the default one first.
 */
function resolveEntriesPreferences(user: SessionUser, accounts: Account[]): EntriesPreferences {
  const usage = user.conta?.config ?? {};
  const currencies = [...new Set(accounts.filter((a) => a.status && a.tipo !== 'CARTEIRA_INVEST').map((a) => a.moeda))].sort(
    (a, b) => (a === usage.moeda ? -1 : b === usage.moeda ? 1 : a - b)
  );
  const picked = user.config?.mdweb?.moeda?.m ?? usage.moeda;
  return {
    pendentesPresente: usage.pendentesPresente,
    apenasMetasDefinidas: usage.metasRD,
    moeda: picked !== undefined && currencies.includes(picked) ? picked : currencies[0],
  };
}

/**
 * The logged-in user's preferences, from the endpoint the web boots from:
 * session.js loads GET /frontend/sessao?uid= and keeps payload.ngInit as
 * window.mdconfig, whose usuario becomes usuariosService.usuario (mdb.js
 * 52085). `get` is the authenticated API GET; `accounts`, every account.
 */
export async function loadEntriesPreferences(
  get: (endpoint: string) => Promise<unknown>,
  uid: string,
  accounts: Promise<Account[]>
): Promise<EntriesPreferences> {
  const query = new URLSearchParams({ uid });
  const [session, list] = await Promise.all([get(`/v1/frontend/sessao?${query.toString()}`), accounts]);
  const user = (session as { payload?: { ngInit?: { usuario?: SessionUser } } }).payload?.ngInit?.usuario ?? {};
  return resolveEntriesPreferences(user, list);
}

/** Like the web's $http params, an undefined preference is left out. */
export function setEntriesPreferences(query: URLSearchParams, preferences: EntriesPreferences): void {
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) query.set(key, String(value));
  }
}
