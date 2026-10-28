import { Command } from 'commander';
import { logger } from './logger.js';
import { t } from '../lib/i18n/index.js';

// Set by action() for the command being run: with --json, errors are written
// as JSON too, so a caller parsing the output never gets plain text.
let jsonErrors = false;

/**
 * Report an error on stderr and exit 1. Shared by command actions for
 * validation failures. Under --json the line is `{"error": "<message>"}`.
 */
export function exitWithError(message: string): never {
  if (jsonErrors) {
    console.error(JSON.stringify({ error: message }));
  } else {
    logger.error(message);
  }
  process.exit(1);
}

/**
 * Wrap a Commander action so thrown errors become exitWithError (exit 1).
 * Keeps command bodies free of identical try/catch blocks.
 */
export function action<Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    // Commander passes the Command itself as the last argument.
    const command = args.at(-1);
    jsonErrors = command instanceof Command && command.opts().json === true;
    try {
      await fn(...args);
    } catch (error) {
      exitWithError(error instanceof Error ? error.message : t('unknownError'));
    }
  };
}
