import chalk from 'chalk';
import { fetchAccounts, fetchConnections, requestSync } from '../../lib/api.js';
import { integerOrNull, numberOrNull, textOrNull } from '../../lib/payload.js';
import { parseInteger } from '../../utils/parse.js';
import { exitAfterFlush, exitWithError } from '../../utils/action.js';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { promptConfirmation } from '../../utils/prompt.js';
import { resolveAccountOrExit } from '../account-id.js';
import { accountConnection, connectionList } from '../connection.js';
import { printSyncList, toSyncList, type SyncListConnection } from './list.js';
import type { SyncRequestResponse } from '../../types/index.js';

export const DEFAULT_SYNC_TIMEOUT_SECONDS = 120;
const DEFAULT_STATUS_CHECK_WINDOW_SECONDS = 5;

interface RunOptions {
  yes?: boolean;
  json?: boolean;
  timeout?: string;
}

interface WaitResult {
  payload: unknown;
  timedOut: boolean;
  waited: boolean;
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
  const message = ids.length === 1 ? t('syncConfirmationOne', ids[0]) : t('syncConfirmationMany', ids.join(', '));
  return chalk.yellow(message);
}

function parseTimeout(value: string | undefined): number {
  const timeout = value === undefined ? undefined : parseInteger(value, 0);
  if (timeout === undefined) exitWithError(t('errorSyncTimeoutInvalid', value ?? ''));
  return timeout;
}

/** The web's statusCheckWindow, defaulting to 5s and never below 10ms. */
function statusCheckWindowSeconds(responses: (SyncRequestResponse | undefined)[]): number {
  const windows = responses.flatMap((response) => {
    const window = numberOrNull(response?.statusCheckWindow);
    return window !== null && window > 0 ? [Math.max(window, 0.01)] : [];
  });
  return windows.length === 0 ? DEFAULT_STATUS_CHECK_WINDOW_SECONDS : Math.max(...windows);
}

function updatingIds(payload: unknown, ids: number[]): number[] {
  const updating: number[] = [];
  for (const connection of connectionList(payload)) {
    const id = integerOrNull(connection.id);
    if (id !== null && ids.includes(id) && textOrNull(connection.status) === 'UPDATING') updating.push(id);
  }
  return updating;
}

function reportInfo(message: string, json: boolean): void {
  if (json) console.error(message);
  else logger.info(message);
}

function reportWarning(message: string, json: boolean): void {
  if (json) console.error(message);
  else logger.warning(message);
}

function reportUpdating(connections: SyncListConnection[], json: boolean): void {
  const updating = connections.flatMap((connection) =>
    connection.status === 'UPDATING' && connection.id !== null ? [connection.id] : [],
  );
  if (updating.length === 0) return;
  const message = updating.length === 1
    ? t('syncUpdatingOne', String(updating[0]))
    : t('syncUpdatingMany', updating.join(', '));
  reportWarning(message, json);
}

const FINAL_STATUSES = new Set(['UPDATED', 'OUTDATED']);
const ACTION_STATUSES = new Set(['WAITING_USER_INPUT', 'WAITING_USER_ACTION']);

/** The web finishes a Sync only on UPDATED/OUTDATED; the rest needs action or failed. */
function reportFinalStatuses(connections: SyncListConnection[], json: boolean): void {
  const rows = connections.flatMap((connection) =>
    connection.id === null ? [] : [{ id: connection.id, status: connection.status ?? t('notSet') }]);
  const final = rows.filter((row) => FINAL_STATUSES.has(row.status));
  const action = rows.filter((row) => ACTION_STATUSES.has(row.status));
  const failed = rows.filter((row) => !FINAL_STATUSES.has(row.status) && !ACTION_STATUSES.has(row.status));
  const lines = (group: typeof rows) => group.map((row) => `${row.id} ${row.status}`).join(', ');

  if (final.length === 1) {
    reportInfo(t('syncFinishedOne', String(final[0]?.id), final[0]?.status ?? t('notSet')), json);
  } else if (final.length > 1) {
    reportInfo(t('syncFinishedMany', lines(final)), json);
  }
  if (action.length === 1) {
    reportWarning(t('syncNeedsActionOne', String(action[0]?.id), action[0]?.status ?? t('notSet')), json);
  } else if (action.length > 1) {
    reportWarning(t('syncNeedsActionMany', lines(action)), json);
  }
  if (failed.length === 1) {
    reportWarning(t('syncFailedOne', String(failed[0]?.id), failed[0]?.status ?? t('notSet')), json);
  } else if (failed.length > 1) {
    reportWarning(t('syncFailedMany', lines(failed)), json);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportWaiting(updating: number[], timeoutSeconds: number, json: boolean): void {
  const message = updating.length === 1
    ? t('syncWaitingOne', String(updating[0]), timeoutSeconds)
    : t('syncWaitingMany', updating.join(', '), timeoutSeconds);
  reportInfo(message, json);
}

function reportStillUpdating(updating: number[], elapsedSeconds: number, json: boolean): void {
  const message = updating.length === 1
    ? t('syncStillUpdatingOne', String(updating[0]), elapsedSeconds)
    : t('syncStillUpdatingMany', updating.join(', '), elapsedSeconds);
  reportInfo(message, json);
}

function reportTimedOut(updating: number[], timeoutSeconds: number, json: boolean): void {
  const message = updating.length === 1
    ? t('syncTimedOutOne', String(updating[0]), timeoutSeconds)
    : t('syncTimedOutMany', updating.join(', '), timeoutSeconds);
  reportWarning(message, json);
}

async function waitForFinalStatus(
  ids: number[],
  first: unknown,
  intervalSeconds: number,
  timeoutSeconds: number,
  json: boolean,
): Promise<WaitResult> {
  let payload = first;
  let updating = updatingIds(payload, ids);
  if (updating.length === 0 || timeoutSeconds === 0) {
    return { payload, timedOut: false, waited: false };
  }

  reportWaiting(updating, timeoutSeconds, json);
  const start = performance.now();
  const deadline = start + timeoutSeconds * 1000;

  while (updating.length > 0) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      reportTimedOut(updating, timeoutSeconds, json);
      return { payload, timedOut: true, waited: true };
    }
    await sleep(Math.min(intervalSeconds * 1000, remaining));
    payload = await fetchConnections();
    updating = updatingIds(payload, ids);
    if (updating.length > 0) {
      const elapsedSeconds = Math.max(1, Math.round((performance.now() - start) / 1000));
      reportStillUpdating(updating, elapsedSeconds, json);
    }
  }

  return { payload, timedOut: false, waited: true };
}

export async function runAction(target: string, options: RunOptions): Promise<void> {
  if (options.json && !options.yes) {
    exitWithError(t('errorSyncRequiresYes'));
  }
  const timeoutSeconds = parseTimeout(options.timeout);

  // "all" is the set of Connection ids. It is not an Account name or alias.
  const ids = target === 'all' ? everyConnectionId(await fetchConnections()) : await accountConnectionIds(target);
  if (ids.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ requested: true, timedOut: false, connections: [] }, null, 2));
    } else {
      logger.info(t('syncNoConnections'));
    }
    return;
  }

  if (!options.yes) {
    const confirmed = await promptConfirmation(confirmation(ids));
    if (!confirmed) {
      logger.info(t('syncCancelled'));
      await exitAfterFlush(0);
    }
  }

  const updated: number[] = [];
  const responses: (SyncRequestResponse | undefined)[] = [];
  try {
    for (const id of ids) {
      responses.push(await requestSync(id));
      updated.push(id);
    }
  } catch (error) {
    if (target !== 'all') throw error;
    const reason = error instanceof Error ? error.message : t('unknownError');
    const done = updated.length === 0 ? t('syncNone') : updated.join(', ');
    throw new Error(t('syncAlreadyUpdated', reason, done), { cause: error });
  }

  const intervalSeconds = statusCheckWindowSeconds(responses);
  const after = await waitForFinalStatus(ids, await fetchConnections(), intervalSeconds, timeoutSeconds, options.json === true);
  const accounts = await fetchAccounts();
  const connections = toSyncList(after.payload, accounts.items).filter(
    (connection) => connection.id !== null && ids.includes(connection.id),
  );

  if (options.json) {
    console.log(JSON.stringify({ requested: true, connections, timedOut: after.timedOut }, null, 2));
  } else {
    printSyncList(connections);
  }

  if (!after.waited) reportUpdating(connections, options.json === true);
  else if (!after.timedOut) reportFinalStatuses(connections, options.json === true);

  if (after.timedOut) await exitAfterFlush(1);
}
