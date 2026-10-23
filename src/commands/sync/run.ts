import chalk from 'chalk';
import { fetchAccounts, fetchConnections, requestSync } from '../../lib/api.js';
import { integerOrNull } from '../../lib/payload.js';
import { exitWithError } from '../../utils/action.js';
import { logger } from '../../utils/logger.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { resolveAccountOrExit } from '../account-id.js';
import { accountConnection, connectionList } from '../connection.js';
import { printSyncList, toSyncList } from './list.js';

interface RunOptions {
  yes?: boolean;
  json?: boolean;
}

/** Every Connection id from the payload, once, in first-seen order. Not an Account lookup. */
function everyConnectionId(payload: unknown): number[] {
  const ids: number[] = [];
  for (const connection of connectionList(payload)) {
    const id = integerOrNull(connection.id);
    if (id !== null && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function accountConnectionIds(target: string): Promise<number[]> {
  const accountId = await resolveAccountOrExit(target);
  const { connectionId } = await accountConnection(accountId);
  return [connectionId];
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
