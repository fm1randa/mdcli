import chalk from 'chalk';
import { fetchAccounts, fetchConnections, requestSync } from '../../lib/api.js';
import { resolveId } from '../../lib/aliases.js';
import { exitWithError } from '../../utils/action.js';
import { logger } from '../../utils/logger.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { printSyncList, toSyncList } from './list.js';

interface RunOptions {
  yes?: boolean;
  json?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function connectionList(payload: unknown): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    throw new Error('GET /v1/integracao/connections did not return a list of connections');
  }
  return payload.flatMap((item) => {
    const connection = asRecord(item);
    return connection ? [connection] : [];
  });
}

/** Connection ids that link this Meu Dinheiro Account (`accounts[].conta`), each id once. */
function connectionIdsForAccount(payload: unknown, accountId: number): number[] {
  const ids: number[] = [];
  for (const connection of connectionList(payload)) {
    const rows = connection.accounts;
    const linked = Array.isArray(rows) && rows.some((row) => integer(asRecord(row)?.conta) === accountId);
    const id = integer(connection.id);
    if (linked && id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Every Connection id from the payload, once, in first-seen order. Not an Account lookup. */
function everyConnectionId(payload: unknown): number[] {
  const ids: number[] = [];
  for (const connection of connectionList(payload)) {
    const id = integer(connection.id);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function accountConnectionIds(target: string): Promise<number[]> {
  const accountId = await resolveId('accounts', target);
  if (accountId === null) {
    exitWithError(`Unknown account: ${target}`);
  }

  const ids = connectionIdsForAccount(await fetchConnections(), accountId);
  if (ids.length === 0) {
    exitWithError(`Account ${accountId} is not linked to any connection.`);
  }
  if (ids.length > 1) {
    exitWithError(`Account ${accountId} is linked to more than one connection (${ids.join(', ')}).`);
  }
  return ids;
}

function confirmation(ids: number[]): string {
  const listed = ids.length === 1 ? `connection ${ids[0]}` : `connections ${ids.join(', ')}`;
  return chalk.yellow(`Request a Sync for ${listed}? Each connector accepts at most 3 Syncs per day. (y/N) `);
}

function reportUpdating(statuses: { id: number | null; status: string | null }[], json: boolean): void {
  const updating = statuses.flatMap((connection) =>
    connection.status === 'UPDATING' && connection.id !== null ? [connection.id] : [],
  );
  if (updating.length === 0) return;
  const noun = updating.length === 1 ? 'Connection' : 'Connections';
  const verb = updating.length === 1 ? 'is' : 'are';
  const message = `${noun} ${updating.join(', ')} ${verb} UPDATING. Run sync list again to see the result.`;
  if (json) console.error(message);
  else logger.warning(message);
}

export async function runAction(target: string, options: RunOptions): Promise<void> {
  if (options.json && !options.yes) {
    exitWithError('sync run --json requires --yes');
  }

  // "all" is the set of Connection ids. It is not an Account name or alias.
  const ids = target === 'all' ? everyConnectionId(await fetchConnections()) : await accountConnectionIds(target);
  if (ids.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ requested: true, connections: [] }, null, 2));
    } else {
      logger.info('No connections to sync.');
    }
    return;
  }

  if (!options.yes) {
    const confirmed = await promptConfirmation(confirmation(ids));
    if (!confirmed) {
      logger.info('Sync cancelled.');
      process.exit(0);
    }
  }

  const updated: number[] = [];
  try {
    for (const id of ids) {
      await requestSync(id);
      updated.push(id);
    }
  } catch (error) {
    if (target !== 'all') throw error;
    const reason = error instanceof Error ? error.message : 'Unknown error';
    const done = updated.length === 0 ? 'none' : updated.join(', ');
    throw new Error(`${reason} Already updated: ${done}.`, { cause: error });
  }

  const after: unknown = await fetchConnections();
  const accounts = await fetchAccounts();
  const connections = toSyncList(after, accounts.items).filter(
    (connection) => connection.id !== null && ids.includes(connection.id),
  );

  if (options.json) {
    console.log(JSON.stringify({ requested: true, connections }, null, 2));
  } else {
    printSyncList(connections);
  }
  reportUpdating(connections, options.json === true);
}
