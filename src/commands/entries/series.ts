import chalk from 'chalk';
import { Option } from 'commander';
import { exitWithError } from '../../utils/action.js';
import type { Entry } from '../../types/index.js';

export type SeriesScope = 'this' | 'following';

/** Human-readable label for the API's `todos` flag. */
export function describeScope(todos: boolean): string {
  return todos ? 'this and the following occurrences' : 'this occurrence only';
}

/** --scope for commands that act on one occurrence of a recurring series. */
export function scopeOption(verb: string): Option {
  return new Option(
    '--scope <scope>',
    `For an occurrence of a recurring series: ${verb} only this one (this, the default) or this one and the following ones (following)`
  ).choices(['this', 'following']);
}

/** The web app asks "Apenas neste / Neste e em todos na sequência" only for these. */
function isSeriesOccurrence(entry: Entry): boolean {
  return Boolean(entry.agendaId) && Boolean(entry.parcela);
}

interface ScopeMessages {
  /** Printed to stderr when a series occurrence is touched without --scope. */
  thisOnlyWarning: string;
  /**
   * Why --scope following is refused on an occurrence the server no longer
   * links to its series: the API returns it with `parcela` but no `agendaId`
   * (the first occurrence, or one already confirmed or reconciled), and
   * `DELETE ?todos=true` on it deletes only it.
   */
  detachedOccurrence: string;
}

/**
 * Turns --scope into the API's `todos` flag (true = this and the following
 * occurrences). Returns undefined for an entry outside a series, where the
 * flag means nothing. Without --scope, a series occurrence gets "this only"
 * plus a warning on stderr, so --json output stays parseable.
 */
export function resolveSeriesScope(
  entryId: number,
  entry: Entry,
  scope: SeriesScope | undefined,
  messages: ScopeMessages
): boolean | undefined {
  if (!isSeriesOccurrence(entry)) {
    if (scope === 'following') {
      if (entry.parcela) exitWithError(messages.detachedOccurrence);
      exitWithError(`Entry ${entryId} is not part of a recurring series, so --scope following does not apply.`);
    }
    return undefined;
  }
  if (scope === undefined) {
    console.error(chalk.yellow('⚠'), messages.thisOnlyWarning);
  }
  return scope === 'following';
}
