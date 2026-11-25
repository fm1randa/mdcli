import type { Account } from '../types/index.js';
import { asRecord } from './payload.js';
import type { WebConfig } from './web-session.js';

/** What the CLI reads of window.mdconfig.usuario; a field of another type is left out. */
interface SessionUser {
  /** usuario.conta.config, the web's c.utilizacao. */
  usage: { pendentesPresente?: boolean; metasRD?: boolean; moeda?: number; visaoCompetencia?: boolean };
  /** usuario.config.mdweb.moeda.m, the currency picked in the web. */
  pickedCurrency?: number;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** The session user of `config`; without the config every field is absent, the web's default. */
function sessionUser(config: WebConfig | null): SessionUser {
  const user = asRecord(config?.usuario);
  const usage = asRecord(asRecord(user?.conta)?.config);
  return {
    usage: {
      pendentesPresente: booleanOrUndefined(usage?.pendentesPresente),
      metasRD: booleanOrUndefined(usage?.metasRD),
      moeda: numberOrUndefined(usage?.moeda),
      visaoCompetencia: booleanOrUndefined(usage?.visaoCompetencia),
    },
    pickedCurrency: numberOrUndefined(asRecord(asRecord(asRecord(user?.config)?.mdweb)?.moeda)?.m),
  };
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
  const usage = user.usage;
  const currencies = [...new Set(accounts.filter((a) => a.status && a.tipo !== 'CARTEIRA_INVEST').map((a) => a.moeda))].sort(
    (a, b) => (a === usage.moeda ? -1 : b === usage.moeda ? 1 : a - b)
  );
  const picked = user.pickedCurrency ?? usage.moeda;
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
  return resolveEntriesPreferences(sessionUser(mdconfig), list);
}

/** Like the web's $http params, an undefined preference is left out. */
export function setEntriesPreferences(query: URLSearchParams, preferences: EntriesPreferences): void {
  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) query.set(key, String(value));
  }
}

/**
 * Whether the user may pick the accrual regime: the web shows the cash/accrual toggle only under
 * c.utilizacao.visaoCompetencia and otherwise sends regime "ca" (relatoriosDatasource G, mdb.js 44178).
 */
export async function competenceViewEnabled(config: Promise<WebConfig | null>): Promise<boolean> {
  return sessionUser(await config).usage.visaoCompetencia === true;
}
