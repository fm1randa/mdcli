import { chromium, type Page, type Browser } from 'playwright';
import type { AuthConfig } from '../types/index.js';
import { getCredentialsFromOnePassword } from './onepassword.js';
import { detectRecaptchaChallenge, solveRecaptcha } from './captcha.js';

const LOGIN_URL = 'https://app.meudinheiroweb.com.br/';
const API_URL_PATTERN = 'app.meudinheiroweb.com.br/api/';

const CHROMIUM_CHANNELS = ['chrome', 'msedge'] as const;

function isChannelNotFoundError(error: unknown): boolean {
  return error instanceof Error && /is not found|Executable doesn't exist/i.test(error.message);
}

async function launchAvailableChromiumChannel(
  launch: (channel: string) => Promise<Browser>
): Promise<Browser> {
  let lastError: unknown;
  for (const channel of CHROMIUM_CHANNELS) {
    try {
      return await launch(channel);
    } catch (error) {
      lastError = error;
      if (!isChannelNotFoundError(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}

// Login captures must carry authorization: pre-login API traffic can already
// send mdapikey/mduid, and accepting it would close the browser and save a
// token-less auth before the user logs in.
const REQUIRED_HEADERS = ['authorization', 'mdapikey', 'mduid'] as const;

const SELECTORS = {
  loginInput: '#container > div > div > form > mdw-input-container > input',
  passwordInput: '#container > div > div > form > div > mdw-input-container > input',
  keepLoggedInCheckbox: '#container > div > div > form > mdw-input-container-checkbox',
  loginButton: '#container > div > div > form > button',
  otpInput: '#container > div > form > div > mdw-input-container > input',
  trustBrowserCheckbox: '#container > div > form > div > mdw-input-container-checkbox',
  continueButton: '#container > div > form > div > div.input-container > button',
} as const;

interface CapturedHeaders {
  authorization?: string;
  mdapikey: string;
  mduid: string;
}

function extractTokenFromAuth(authorization: string): string {
  return authorization.replace(/^Bearer\s+/i, '');
}

function hasAllRequiredHeaders(headers: Record<string, string>): boolean {
  return REQUIRED_HEADERS.every((key) => {
    const value = headers[key];
    return value !== undefined && value !== '';
  });
}

function validateCapturedAuth(auth: AuthConfig): string[] {
  const missing: string[] = [];
  if (!auth.apiKey) missing.push('apiKey');
  if (!auth.uid) missing.push('uid');
  return missing;
}

export async function captureAuthFromBrowser(): Promise<AuthConfig> {
  const browser = await launchAvailableChromiumChannel((channel) =>
    chromium.launch({
      headless: false,
      channel,
      args: ['--window-size=1280,800'],
    })
  );

  let browserDisconnected = false;
  browser.on('disconnected', () => {
    browserDisconnected = true;
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let capturedHeaders: CapturedHeaders | null = null;

  page.on('request', (request) => {
    const url = request.url();

    if (url.includes(API_URL_PATTERN) && !capturedHeaders) {
      const headers = request.headers();

      if (hasAllRequiredHeaders(headers)) {
        capturedHeaders = {
          authorization: headers['authorization'],
          mdapikey: headers['mdapikey'],
          mduid: headers['mduid'],
        };
        console.log('✓ Authentication headers captured successfully.');
      }
    }
  });

  await page.goto(LOGIN_URL);

  console.log('\n📱 Browser opened. Please log in to Meu Dinheiro.');
  console.log('   The browser will close automatically after capturing all credentials.\n');

  while (!capturedHeaders) {
    if (browserDisconnected) {
      throw new Error('Browser was closed before all credentials were captured.');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  const result: CapturedHeaders = capturedHeaders;

  const auth: AuthConfig = {
    apiKey: result.mdapikey,
    uid: result.mduid,
    ...(result.authorization ? { token: extractTokenFromAuth(result.authorization) } : {}),
  };

  const missingFields = validateCapturedAuth(auth);
  if (missingFields.length > 0) {
    throw new Error(`Authentication incomplete. Missing: ${missingFields.join(', ')}`);
  }

  return auth;
}

async function waitForSelector(page: Page, selector: string, timeout = 30000): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

function setupAuthCapture(page: Page, onCaptured: (headers: CapturedHeaders) => void): void {
  page.on('request', (request) => {
    const url = request.url();

    if (url.includes(API_URL_PATTERN)) {
      const headers = request.headers();

      if (hasAllRequiredHeaders(headers)) {
        onCaptured({
          authorization: headers['authorization'],
          mdapikey: headers['mdapikey'],
          mduid: headers['mduid'],
        });
      }
    }
  });
}

function headersToAuthConfig(headers: CapturedHeaders): AuthConfig {
  return {
    apiKey: headers.mdapikey,
    uid: headers.mduid,
    ...(headers.authorization ? { token: extractTokenFromAuth(headers.authorization) } : {}),
  };
}

export async function captureAuthHeadless(opItemName: string): Promise<AuthConfig> {
  const credentials = await getCredentialsFromOnePassword(opItemName);

  const browser = await launchAvailableChromiumChannel((channel) =>
    chromium.launch({
      headless: true,
      channel,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  );

  try {
    const auth = await performHeadlessLogin(browser, credentials, opItemName);
    return auth;
  } finally {
    await browser.close();
  }
}

interface LoginCredentials {
  username: string;
  password: string;
  otp: string;
}

async function fillLoginForm(page: Page, username: string, password: string): Promise<void> {
  await waitForSelector(page, SELECTORS.loginInput);
  await page.type(SELECTORS.loginInput, username);

  await waitForSelector(page, SELECTORS.passwordInput);
  await page.type(SELECTORS.passwordInput, password);

  await waitForSelector(page, SELECTORS.keepLoggedInCheckbox);
  await page.click(SELECTORS.keepLoggedInCheckbox);

  await waitForSelector(page, SELECTORS.loginButton);
  await page.click(SELECTORS.loginButton);

  const hasCaptcha = await detectRecaptchaChallenge(page);
  if (hasCaptcha) {
    const solved = await solveRecaptcha(page);
    if (!solved) {
      throw new Error('Failed to solve reCAPTCHA challenge');
    }
  }
}

async function clearInput(page: Page, selector: string): Promise<void> {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
}

async function checkForMfaError(page: Page): Promise<boolean> {
  const pageContent = await page.content();
  return pageContent.includes('Código MFA inválido');
}

async function fillOtpForm(page: Page, otp: string): Promise<void> {
  await waitForSelector(page, SELECTORS.otpInput, 60000);
  await page.type(SELECTORS.otpInput, otp);

  await waitForSelector(page, SELECTORS.trustBrowserCheckbox);
  await page.click(SELECTORS.trustBrowserCheckbox);

  await waitForSelector(page, SELECTORS.continueButton);
  await page.click(SELECTORS.continueButton);
}

async function retryOtpIfInvalid(page: Page, opItemName: string, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const hasError = await checkForMfaError(page);
    if (!hasError) {
      return;
    }

    if (attempt === maxRetries) {
      throw new Error('OTP validation failed after maximum retries');
    }

    console.log(`OTP invalid, fetching fresh code (attempt ${attempt + 1}/${maxRetries})...`);

    const freshCredentials = await getCredentialsFromOnePassword(opItemName);

    await clearInput(page, SELECTORS.otpInput);
    await page.type(SELECTORS.otpInput, freshCredentials.otp);
    await page.click(SELECTORS.continueButton);
  }
}

async function waitForAuthCapture(
  capturedRef: { headers: CapturedHeaders | null },
  timeoutMs = 30000
): Promise<CapturedHeaders> {
  const startTime = Date.now();

  while (!capturedRef.headers && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!capturedRef.headers) {
    throw new Error('Failed to capture authentication headers after login');
  }

  return capturedRef.headers;
}

async function performHeadlessLogin(
  browser: Browser,
  credentials: LoginCredentials,
  opItemName: string
): Promise<AuthConfig> {
  const page = await browser.newPage();
  const capturedRef: { headers: CapturedHeaders | null } = { headers: null };

  setupAuthCapture(page, (headers) => {
    capturedRef.headers = headers;
  });

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await fillLoginForm(page, credentials.username, credentials.password);
  await fillOtpForm(page, credentials.otp);
  await retryOtpIfInvalid(page, opItemName);

  const capturedHeaders = await waitForAuthCapture(capturedRef);
  const auth = headersToAuthConfig(capturedHeaders);

  const missingFields = validateCapturedAuth(auth);
  if (missingFields.length > 0) {
    throw new Error(`Authentication incomplete. Missing: ${missingFields.join(', ')}`);
  }

  return auth;
}
