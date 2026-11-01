import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { cell } from '../../utils/text.js';
import { fetchAccounts, fetchConnections } from '../../lib/api.js';
import { asRecord, integerOrNull, textOrNull } from '../../lib/payload.js';
import { connectionList } from '../connection.js';
import type { Account } from '../../types/index.js';
import { newTable } from '../../utils/table.js';

interface SyncListAccount {
  connectionAccount: number | null;
  accountId: number | null;
  accountName: string | null;
  type: string | null;
}

interface SyncListConnection {
  id: number | null;
  status: string | null;
  accounts: SyncListAccount[];
}

function accountName(accountId: number | null, accounts: Account[]): string | null {
  if (accountId === null) return null;
  const account = accounts.find((item) => item.id === accountId);
  return account?.nome ?? null;
}

/** A field the connections payload did not send stays null. Names come only from the account registry. */
export function toSyncList(payload: unknown, accounts: Account[]): SyncListConnection[] {
  return connectionList(payload).map((connection) => {
    const rows = connection.accounts;
    const accountsOnConnection = Array.isArray(rows) ? rows : [];
    return {
      id: integerOrNull(connection.id),
      status: textOrNull(connection.status),
      accounts: accountsOnConnection.map((row): SyncListAccount => {
        const record = asRecord(row);
        const accountId = integerOrNull(record?.conta);
        return {
          connectionAccount: integerOrNull(record?.id),
          accountId,
          accountName: accountName(accountId, accounts),
          type: textOrNull(record?.type),
        };
      }),
    };
  });
}

export async function listAction(options: { json?: boolean }): Promise<void> {
  const payload: unknown = await fetchConnections();
  // The connections payload has no account name; the registry does.
  const accounts = await fetchAccounts();
  const connections = toSyncList(payload, accounts.items);

  if (options.json) {
    console.log(JSON.stringify({ connections }, null, 2));
    return;
  }

  printSyncList(connections);
}

/** Same table as `sync list`: one row per connection account, or one for a connection with none. */
export function printSyncList(connections: SyncListConnection[]): void {
  const table = newTable({
    head: [t('syncConnectionColumn'), t('labelStatus'), t('labelType'), t('syncConnectionAccountColumn'), t('labelAccount')],
    style: { head: ['cyan'] },
  });

  for (const connection of connections) {
    // A connection with no connection account (e.g. a failed setup) still shows its status.
    if (connection.accounts.length === 0) {
      table.push([cell(connection.id), cell(connection.status), cell(null), cell(null), cell(null)]);
    }
    for (const account of connection.accounts) {
      table.push([
        cell(connection.id),
        cell(connection.status),
        cell(account.type),
        cell(account.connectionAccount),
        accountLabel(account),
      ]);
    }
  }

  logger.header(t('syncConnectionsHeader', connections.length));
  console.log(table.toString());
}

/** Name from the registry, or that the bank account has no Account. Never a guessed name. */
function accountLabel(account: SyncListAccount): string {
  if (account.accountId === null && account.accountName === null) return t('syncNoAccount');
  return cell(account.accountName);
}
