// The one source of the suite's deadlines (#293). Loose numbers drifted apart:
// self-update polled for 1 s while a test had 20 s, and failed under load
// (#248, again in the CI run of #292) long before its own timeout.

/** Per-test and per-hook timeout of every `bun test` run; test/setup.ts applies it. */
export const TEST_TIMEOUT_MS = 20_000;

/** How long a poll waits for a background effect: half a test, leaving time to assert and clean up. */
const POLL_DEADLINE_MS = TEST_TIMEOUT_MS / 2;

/** Chrome's launch deadline, below the hook's so the launch error names the cause before bun kills the hook. */
export const BROWSER_LAUNCH_TIMEOUT_MS = (TEST_TIMEOUT_MS * 3) / 4;

/** Chrome's close deadline in an afterAll hook. */
export const BROWSER_CLOSE_TIMEOUT_MS = TEST_TIMEOUT_MS / 2;

const POLL_INTERVAL_MS = 20;

/** Polls `probe` until it returns a truthy value, or null once the poll deadline passes. */
export async function waitFor<T>(probe: () => T | null): Promise<T | null> {
  const deadline = performance.now() + POLL_DEADLINE_MS;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (performance.now() >= deadline) return null;
    await Bun.sleep(POLL_INTERVAL_MS);
  }
}
