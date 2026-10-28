import { fetchConnections } from '../lib/api.js';
import { asRecord, integerOrNull } from '../lib/payload.js';
import { exitWithError } from '../utils/action.js';
import { t } from '../lib/i18n/index.js';

/** Where an Account sits on the bank side: its Connection and, there, its connection account. */
export interface AccountConnection {
  connectionId: number;
  /** `accounts[].id`. Null when the connection did not send it. */
  connectionAccount: number | null;
  /** `accounts[].summary`: the new Bank Transactions the web's import badge shows. Null when the GET left it out. */
  summary: unknown;
  /** `markImportedWindowDays`: how far back from the latest date markImported still marks. Null when the GET left it out. */
  markImportedWindowDays: number | null;
}

/** Each Connection object of GET /v1/integracao/connections. Anything else in the list is left out. */
export function connectionList(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    throw new Error(t('errorConnectionsPayload'));
  }
  return payload.flatMap((item) => {
    const connection = asRecord(item);
    return connection ? [connection] : [];
  });
}

/**
 * The one Connection whose `accounts[].conta` is this Account (`sync run`, `entries import`).
 * No Connection, more than one, or two connection accounts on it: exit, so nothing is synced or written.
 */
export async function accountConnection(accountId: number): Promise<AccountConnection> {
  const found = new Map<number, Set<number | null>>();
  let summary: unknown = null;
  let markImportedWindowDays: number | null = null;
  for (const connection of connectionList(await fetchConnections())) {
    const rows = Array.isArray(connection.accounts) ? connection.accounts : [];
    for (const row of rows) {
      const record = asRecord(row);
      if (integerOrNull(record?.conta) !== accountId) continue;
      const connectionId = integerOrNull(connection.id);
      if (connectionId === null) {
        exitWithError(t('errorConnectionMissingId', accountId));
      }
      const accounts = found.get(connectionId) ?? new Set<number | null>();
      accounts.add(integerOrNull(record?.id));
      summary ??= record?.summary ?? null;
      markImportedWindowDays ??= integerOrNull(connection.markImportedWindowDays);
      found.set(connectionId, accounts);
    }
  }
  const ids = [...found.keys()];
  if (ids.length === 0) {
    exitWithError(t('errorAccountWithoutConnection', accountId));
  }
  if (ids.length > 1) {
    exitWithError(t('errorAccountMultipleConnections', accountId, ids.join(', ')));
  }
  const [connectionId] = ids;
  const accounts = [...(found.get(connectionId) ?? [])];
  if (accounts.length > 1) {
    exitWithError(t('errorAccountLinkedTwice', accountId, connectionId, accounts.join(', ')));
  }
  return { connectionId, connectionAccount: accounts[0] ?? null, summary, markImportedWindowDays };
}
