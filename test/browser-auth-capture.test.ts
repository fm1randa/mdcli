import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright';
import { setupAuthCapture } from '../src/lib/browser-auth.js';

// Regression: `auth login --browser` hung when the authenticated /api/ traffic
// came from a tab other than the first one (the listener was page-scoped).
let browser: Browser;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/api/')) return Response.json({});
      if (pathname === '/') {
        // Pre-login traffic: apikey only, no authorization.
        return new Response(
          `<script>fetch('/api/v1/frontend/sessao',{headers:{mdApiKey:'K'}})</script>login`,
          { headers: { 'content-type': 'text/html' } }
        );
      }
      return new Response(
        `<script>fetch('/api/v1/visaogeral',{headers:{Authorization:'Bearer T',mdApiKey:'K',mdUid:'42'}})</script>dash`,
        { headers: { 'content-type': 'text/html' } }
      );
    },
  });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

describe('setupAuthCapture', () => {
  test('captures auth headers sent from a tab opened after the login page', async () => {
    const context = await browser.newContext();
    const captured: Array<{ authorization?: string; mdapikey: string; mduid: string }> = [];
    setupAuthCapture(context, (h) => captured.push(h), `127.0.0.1:${server.port}/api/`);

    const loginPage = await context.newPage();
    await loginPage.goto(`http://127.0.0.1:${server.port}/`);
    await loginPage.waitForLoadState('networkidle');
    expect(captured).toEqual([]);

    const dashboard = await context.newPage();
    await dashboard.goto(`http://127.0.0.1:${server.port}/u/42`);
    await dashboard.waitForLoadState('networkidle');

    expect(captured[0]).toEqual({ authorization: 'Bearer T', mdapikey: 'K', mduid: '42' });
    await context.close();
  });
});
