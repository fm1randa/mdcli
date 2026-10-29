import { chromium, type Browser } from 'playwright';

// Chrome's first run and its background work have stalled Playwright's launch
// past bun's 20 s hook timeout on CI (run 40568587595: browser-session-capture
// timed out in beforeAll after 20 s, while browser-auth-capture took 8.9 s in
// the same run). These flags skip that first-run work. They are test-only and
// a mitigation, not a proven fix: the real login launches Chrome unchanged.
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
