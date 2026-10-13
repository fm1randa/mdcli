import { logger } from './logger.js';

/** Log an error and exit. Shared by command actions for validation failures. */
export function exitWithError(message: string): never {
  logger.error(message);
  process.exit(1);
}

/**
 * Wrap a Commander action so thrown errors become logger.error + exit 1.
 * Keeps command bodies free of identical try/catch blocks.
 */
export function action<Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch (error) {
      exitWithError(error instanceof Error ? error.message : 'Unknown error');
    }
  };
}
