import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { setupAuthCapture } from '../src/lib/browser-auth.js';

// Regression for auth --session: extractSessionFromBrowser used to listen on
// the first page only (page.on('request')). It now reuses setupAuthCapture on
// the BrowserContext, same as auth login --browser (#63). Guard the shared
// helper with the first-wins ref the session path uses.
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/api/')) return Response.json({});
      if (pathname === '/') {
        return new Response(
          `<script>fetch('/api/v1/frontend/sessao',{headers:{mdApiKey:'K'}})</script>login`,
          { headers: { 'content-type': 'text/html' } }
        );
      }
      return new Response(
        `<script>fetch('/api/v1/visaogeral',{headers:{Authorization:'Bearer SESS',mdApiKey:'K',mdUid:'7'}})</script>dash`,
        { headers: { 'content-type': 'text/html' } }
      );
    },
  });
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
    ],
  });
});

afterAll(async () => {
  await Promise.race([
    browser?.close(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('browser close timeout')), 10000)),
  ]);
  server?.stop(true);
});

describe('session auth capture (setupAuthCapture)', () => {
  test('first-wins ref captures auth headers from a later tab', async () => {
    const context = await browser.newContext();
    const apiHeadersRef: { captured: { authorization?: string; mdapikey: string; mduid: string } | null } = {
      captured: null,
    };
    setupAuthCapture(context, (headers) => {
      if (apiHeadersRef.captured) return;
      apiHeadersRef.captured = headers;
    }, `127.0.0.1:${server.port}/api/`);

    const first = await context.newPage();
    await first.goto(`http://127.0.0.1:${server.port}/`);
    await first.waitForLoadState('networkidle');
    expect(apiHeadersRef.captured).toBeNull();

    const other = await context.newPage();
    await other.goto(`http://127.0.0.1:${server.port}/u/7`);
    await other.waitForLoadState('networkidle');

    expect(apiHeadersRef.captured).toEqual({ authorization: 'Bearer SESS', mdapikey: 'K', mduid: '7' });
    await context.close();
  });
});
