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

/** Thrown by exitWithError to stop the command; action() turns it into exit 1. */
class ExitSignal extends Error {}

function reportError(message: string): void {
  if (jsonErrors) {
    console.error(JSON.stringify({ error: message }));
  } else {
    logger.error(message);
  }
}

/**
 * Report an error on stderr and stop the command. Shared by command actions for
 * validation failures. Under --json the line is `{"error": "<message>"}`.
 * Throwing stops the action synchronously, so nothing after the refusal runs;
 * action() flushes stdout and exits 1.
 */
export function exitWithError(message: string): never {
  reportError(message);
  throw new ExitSignal(message);
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
      if (!(error instanceof ExitSignal)) {
        reportError(error instanceof Error ? error.message : t('unknownError'));
      }
      // Flush stdout so the error message and any prior output are fully drained
      // to the pipe before the process exits; without this, output can be truncated
      // at the kernel pipe buffer size (65536 bytes).
      await flushStdout(3000);
      // eslint-disable-next-line local/no-bare-process-exit
      process.exit(1);
    }
  };
}
