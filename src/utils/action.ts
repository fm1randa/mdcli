import { Command } from 'commander';
import { logger } from './logger.js';
import { t } from '../lib/i18n/index.js';

/** Flush stdout before the process exits, so piped output isn't truncated. */
export function flushStdout(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const ok = process.stdout.write('');
    if (ok) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      process.stdout.removeListener('drain', resolve);
      resolve();
    }, timeoutMs);
    process.stdout.once('drain', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

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
  // Flush stdout so the error message and any prior output are fully drained
  // to the pipe before the process exits; without this, output can be truncated
  // at the kernel pipe buffer size (65536 bytes).
  flushStdout(3000)
    // eslint-disable-next-line local/no-bare-process-exit
    .then(() => process.exit(1))
    // eslint-disable-next-line local/no-bare-process-exit
    .catch(() => process.exit(1));
  // Block forever so this never returns synchronously; the timeout above
  // ensures we exit even if the drain event never fires.
  return new Promise(() => {}) as never;
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
      // await ensures we don't resolve the action (and thus the CLI) before
      // stdout is flushed and process.exit() runs.
      await exitWithError(error instanceof Error ? error.message : t('unknownError'));
    }
  };
}
