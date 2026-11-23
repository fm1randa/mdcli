import { chromium, type Browser } from 'playwright';
import { BROWSER_CLOSE_TIMEOUT_MS, BROWSER_LAUNCH_TIMEOUT_MS } from './timeouts.js';

// A hook timed out after 20 s in CI (run 40568587595): its file reported no
// test, only "a beforeEach/afterEach hook timed out", and bun killed the
// dangling process — the launch in beforeAll never came back. Chrome was also
// 8.9 s for one test in that run, ~18x its time here, so the runner was slow.
// These flags skip Chrome's first-run work. Test-only: a plausible mitigation,
// not a proven fix, and the real login launches Chrome unchanged.
const LAUNCH_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',
] as const;

// The flags alone did not stop it: 5 of 60 CI runs still timed out in the
// launch (#248), and in each one the other browser file also took 6-10 s for
// a single page flow. Chrome was starving next to the `bun test --parallel`
// workers, so `bun run test` runs test/browser-*.test.ts in a serial phase
// after the pool. A launch inside a pool worker fails here instead of
// flaking in CI.
export async function launchTestBrowser(): Promise<Browser> {
  if (process.env.BUN_TEST_WORKER_ID !== undefined) {
    throw new Error('Chrome launched inside a --parallel worker: name the file test/browser-*.test.ts so `bun run test` runs it serially.');
  }
  return chromium.launch({ channel: 'chrome', headless: true, timeout: BROWSER_LAUNCH_TIMEOUT_MS, args: [...LAUNCH_ARGS] });
}

// bun kills a dangling browser when a hook hangs and reports only the timeout:
// fail with the reason and keep the timer from outliving the close.
export async function closeTestBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('browser close timeout')), BROWSER_CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
