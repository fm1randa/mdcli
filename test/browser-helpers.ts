import { chromium, type Browser } from 'playwright';

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

export async function launchTestBrowser(): Promise<Browser> {
  return chromium.launch({ channel: 'chrome', headless: true, args: [...LAUNCH_ARGS] });
}

const CLOSE_TIMEOUT_MS = 10000;

// bun kills a dangling browser when a hook hangs and reports only the timeout:
// fail with the reason and keep the timer from outliving the close.
export async function closeTestBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('browser close timeout')), CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
