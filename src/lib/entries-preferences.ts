import type { Account } from '../types/index.js';
import type { WebConfig } from './web-session.js';

/** The user as window.mdconfig.usuario has it. */
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
 * The logged-in user's preferences: window.mdconfig.usuario becomes
 * usuariosService.usuario (mdb.js 52085); without the config (src/lib/web-session.ts)
 * the user has none and every preference is the web's default.
 * `accounts`, every account.
 */
export async function loadEntriesPreferences(config: Promise<WebConfig | null>, accounts: Promise<Account[]>): Promise<EntriesPreferences> {
  const [mdconfig, list] = await Promise.all([config, accounts]);
  return resolveEntriesPreferences((mdconfig?.usuario ?? {}) as SessionUser, list);
}

/** Like the web's $http params, an undefined preference is left out. */
export function setEntriesPreferences(query: URLSearchParams, preferences: EntriesPreferences): void {
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) query.set(key, String(value));
  }
}
