// The one source of the suite's deadlines (#293). Loose numbers drifted apart:
// self-update polled for 1 s while a test had 20 s, and failed under load
// (#248, again in the CI run of #292) long before its own timeout.

/** Per-test and per-hook timeout of every `bun test` run; test/setup.ts applies it. */
export const TEST_TIMEOUT_MS = 20_000;

/** Half a test. waitFor's deadline and the terminal exit race. */
export const POLL_DEADLINE_MS = TEST_TIMEOUT_MS / 2;

/**
 * How long the up-to-date self-update test waits to see that no background
 * install started. Not a fraction of the suite budget: a longer test timeout
 * must not stretch this observation.
 */
export const QUIET_WINDOW_MS = 100;

/** Chrome's launch deadline, below the hook's so the launch error names the cause before bun kills the hook. */
export const BROWSER_LAUNCH_TIMEOUT_MS = (TEST_TIMEOUT_MS * 3) / 4;

/** Chrome's close deadline in an afterAll hook. */
export const BROWSER_CLOSE_TIMEOUT_MS = TEST_TIMEOUT_MS / 2;

const POLL_INTERVAL_MS = 20;

export interface WaitOptions {
  /** When this returns true and the probe is still empty, waitFor resolves null. */
  abort?: () => boolean;
}

/** Polls `probe` until it returns a truthy value, or null when the deadline passes or `abort` fires. */
export async function waitFor<T>(probe: () => T | null, options?: WaitOptions): Promise<T | null> {
  const deadline = performance.now() + POLL_DEADLINE_MS;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (options?.abort?.()) return null;
    if (performance.now() >= deadline) return null;
    await Bun.sleep(POLL_INTERVAL_MS);
  }
}
