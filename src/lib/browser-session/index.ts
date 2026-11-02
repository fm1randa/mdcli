import { t } from '../i18n/index.js';
import type { AuthConfig } from '../../types/index.js';
import { getChromeCookieValue, getChromeProfilePath, getEdgeProfilePath } from './chromium.js';
import { getFirefoxProfilePath } from './firefox.js';
import { extractUidFromJwt, fetchPublicApiKey } from './jwt.js';
import { cleanupTempDir, copyProfileToTemp } from './profile-copy.js';
import { setupAuthCapture } from '../browser-auth.js';


export {
  getChromeProfilePath,
  getEdgeProfilePath,
  checkChromeProfileReadable,
  checkEdgeProfileReadable,
} from './chromium.js';
export { getFirefoxProfilePath, parseFirefoxInstallDefaults } from './firefox.js';


interface LoginConfigRaw {
  mdApiKey?: string;
  mdauthtoken?: string;
  uid?: number | null;
}

interface BrowserSessionOptions {
  browser: 'chrome' | 'firefox' | 'edge';
  timeout?: number;
}

export async function extractSessionFromBrowser(
  options?: BrowserSessionOptions
): Promise<AuthConfig> {
  const browserType = options?.browser ?? 'chrome';
  const profilePath =
    browserType === 'chrome'
      ? getChromeProfilePath()
      : browserType === 'edge'
        ? getEdgeProfilePath()
        : getFirefoxProfilePath();

  let tempDir: string | null = null;

  try {
    tempDir = await copyProfileToTemp(profilePath, browserType);

    const { chromium, firefox } = await import('playwright');
    const browserLauncher = browserType === 'firefox' ? firefox : chromium;
    const channel = browserType === 'chrome' ? 'chrome' : browserType === 'edge' ? 'msedge' : undefined;
    let context;
    try {
      context = await browserLauncher.launchPersistentContext(tempDir, {
        headless: true,
        channel,
        timeout: 30000,
      });
    } catch (error) {
      if (error instanceof Error && /Timeout .*exceeded/i.test(error.message)) {
        throw new Error(
          `Browser took too long to start with the copied profile (this can happen on managed/corporate ` +
            `machines where the browser tries to reach blocked network services on launch).\n` +
            `Try: mdcli auth login --browser or --item`,
          { cause: error }
        );
      }
      throw error;
    }

    try {
      const page = context.pages()[0] ?? (await context.newPage());

      // Capture loginconfig via setter trap - prevents losing it if page redirects to dashboard
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const browserWindow = globalThis as any;
        Object.defineProperty(browserWindow, 'loginconfig', {
          set(value: unknown) {
            browserWindow.__captured_loginconfig = value;
            Object.defineProperty(browserWindow, 'loginconfig', { value, writable: true });
          },
          configurable: true,
        });
      });

      // Fallback signal: if the app is already authenticated, it skips the
      // login page entirely and goes straight to loading dashboard data --
      // loginconfig may never be set in that path, but the real API calls
      // still carry the auth headers, so capture those too. Authorization is
      // required: pre-login traffic can already send mdapikey/mduid, and
      // accepting it would save a token-less auth from a logged-out profile.
      // Context-wide, same as auth login --browser (#63): a page-level
      // listener misses API traffic from another tab/popup during the wait.
      const apiHeadersRef: { captured: { authorization?: string; mdapikey: string; mduid: string } | null } = {
        captured: null,
      };
      setupAuthCapture(context, (headers) => {
        if (apiHeadersRef.captured) return;
        apiHeadersRef.captured = headers;
      });

      await page.goto('https://app.meudinheiroweb.com.br/', { waitUntil: 'domcontentloaded' });

      // Wait for whichever signal shows up first: the Angular app setting
      // loginconfig (unauthenticated -> login page), or a real API request
      // carrying auth headers (already authenticated -> straight to
      // dashboard, loginconfig may never be set at all).
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline && !apiHeadersRef.captured) {
        // The SPA can navigate mid-poll (login -> dashboard), destroying the
        // execution context. A failed evaluate just means "not yet" — retry
        // until the deadline instead of failing the whole extraction.
        const hasLoginConfig = await page
          .evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const browserWindow = globalThis as any;
            return Boolean(browserWindow.__captured_loginconfig || browserWindow.loginconfig);
          })
          .catch(() => false);
        if (hasLoginConfig) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const loginConfig = await page
        .evaluate((): LoginConfigRaw | null => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const browserWindow = globalThis as any;
          const config = browserWindow.__captured_loginconfig || browserWindow.loginconfig;
          if (!config) return null;
          return {
            mdApiKey: config.mdApiKey,
            mdauthtoken: config.mdauthtoken,
            uid: config.uid,
          };
        })
        // Same navigation hazard as above: fall through to the cookie and
        // captured-header fallbacks instead of throwing.
        .catch(() => null);

      const cookies = await context.cookies('https://app.meudinheiroweb.com.br/');
      const authCookie = cookies.find((c) => c.name === 'mdauthtoken0');

      const capturedApiHeaders = apiHeadersRef.captured;

      let token =
        loginConfig?.mdauthtoken ??
        authCookie?.value ??
        (capturedApiHeaders?.authorization?.replace(/^Bearer\s+/i, '') ?? '');

      if (!token && browserType === 'chrome') {
        token = getChromeCookieValue('mdauthtoken0', '.meudinheiroweb.com.br') ?? '';
      }

      // The current frontend no longer sets window.loginconfig: it reads the
      // public API key from /frontend/sessao instead. A copied Chrome profile
      // also loses its encrypted cookies, so the token above may only come
      // from the Keychain fallback -- pair it with that public key.
      const apiKey =
        loginConfig?.mdApiKey ??
        capturedApiHeaders?.mdapikey ??
        (token ? await fetchPublicApiKey() : undefined);

      if (!apiKey) {
        if (!loginConfig && !capturedApiHeaders && !token) {
          throw new Error(t('errorNotLoggedIn'));
        }
        throw new Error(
          'Failed to extract authentication config from page. The site structure may have changed.\nTry: mdcli auth login --browser'
        );
      }

      let uid =
        loginConfig?.uid != null
          ? String(loginConfig.uid)
          : capturedApiHeaders?.mduid ?? extractUidFromJwt(token);

      // Fallback: read uid from localStorage rememberedUsers
      if (!uid) {
        // Same navigation hazard as above: a failed read must not fail the
        // extraction when a token was already recovered elsewhere.
        uid = await page
          .evaluate(() => {
            try {
              const rememberedUsers = localStorage.getItem('meudinheiro::rememberedUsers');
              if (!rememberedUsers) return null;
              const users = JSON.parse(rememberedUsers);
              return users[0]?.id ? String(users[0].id) : null;
            } catch {
              return null;
            }
          })
          .catch(() => null);
      }

      if (!uid) {
        throw new Error(t('errorUserIdUnknown'));
      }

      return {
        apiKey,
        uid,
        ...(token ? { token } : {}),
      };
    } finally {
      await context.close();
    }
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}
