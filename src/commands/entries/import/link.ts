import { fetchConnections } from '../../../lib/api.js';
import { exitWithError } from '../../../utils/action.js';
import { asRecord, idOrNull } from './read.js';

export interface AccountLink {
  connectionId: number;
  connectionAccount: number;
}

/** The one Connection whose accounts[].conta is this Account. accounts[].id is the connection account. */
export async function linkedConnection(accountId: number): Promise<AccountLink> {
  const payload: unknown = await fetchConnections();
  const links = linksFor(payload, accountId);
  if (links.length === 0) {
    exitWithError(`Account ${accountId} is not linked to a connection.`);
  }
  if (links.length > 1) {
    exitWithError(`Account ${accountId} is linked to more than one connection.`);
  }
  return links[0];
}

function linksFor(payload: unknown, accountId: number): AccountLink[] {
  if (!Array.isArray(payload)) {
    throw new Error('GET /v1/integracao/connections did not return a list of connections');
  }
  const links: AccountLink[] = [];
  const seen = new Set<string>();
  for (const item of payload) {
    const connection = asRecord(item);
    const connectionId = idOrNull(connection?.id);
    const rows = Array.isArray(connection?.accounts) ? connection.accounts : [];
    for (const row of rows) {
      const record = asRecord(row);
      if (idOrNull(record?.conta) !== accountId) continue;
      const connectionAccount = idOrNull(record?.id);
      if (connectionId === null || connectionAccount === null) {
        exitWithError(`Account ${accountId} is linked to a connection that did not include its ids.`);
      }
      const key = `${connectionId}:${connectionAccount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ connectionId, connectionAccount });
    }
  }
  return links;
}
