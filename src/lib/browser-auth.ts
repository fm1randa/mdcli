import puppeteer, { type Page, type Browser } from 'puppeteer';
import type { AuthConfig } from '../types/index.js';
import { getCredentialsFromOnePassword } from './onepassword.js';
import { detectRecaptchaChallenge, solveRecaptcha } from './captcha.js';

const LOGIN_URL = 'https://app.meudinheiroweb.com.br/';
const API_URL_PATTERN = 'app.meudinheiroweb.com.br/api/';

const REQUIRED_HEADERS = ['authorization', 'mdapikey', 'mdpolicy', 'mdsignature', 'mduid'] as const;

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
  authorization: string;
  cookie: string;
  mdapikey: string;
  mdpolicy: string;
  mdsignature: string;
  mduid: string;
}

function extractTokenFromAuth(authorization: string): string {
  return authorization.replace(/^Bearer\s+/i, '');
}

function extractTokenFromCookie(cookie: string): string {
  const match = cookie.match(/mdauthtoken0=([^;]+)/);
  return match?.[1] ?? '';
}

function hasAllRequiredHeaders(headers: Record<string, string>): boolean {
  return REQUIRED_HEADERS.every((key) => {
    const value = headers[key];
    return value !== undefined && value !== '';
  });
}

function getMissingHeaders(headers: Record<string, string>): string[] {
  return REQUIRED_HEADERS.filter((key) => {
    const value = headers[key];
    return value === undefined || value === '';
  });
}

function validateCapturedAuth(auth: AuthConfig): string[] {
  const missing: string[] = [];
  if (!auth.token) missing.push('token');
  if (!auth.apiKey) missing.push('apiKey');
  if (!auth.policy) missing.push('policy');
  if (!auth.signature) missing.push('signature');
  if (!auth.uid) missing.push('uid');
  return missing;
}

export async function captureAuthFromBrowser(): Promise<AuthConfig> {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);

  let capturedHeaders: CapturedHeaders | null = null;
  let partialCaptures = 0;

  page.on('request', (request) => {
    const url = request.url();

    if (url.includes(API_URL_PATTERN) && !capturedHeaders) {
      const headers = request.headers();
      
      if (hasAllRequiredHeaders(headers)) {
        capturedHeaders = {
          authorization: headers['authorization'],
          cookie: headers['cookie'] ?? '',
          mdapikey: headers['mdapikey'],
          mdpolicy: headers['mdpolicy'],
          mdsignature: headers['mdsignature'],
          mduid: headers['mduid'],
        };
        console.log('✓ All authentication headers captured successfully.');
      } else if (headers['authorization']) {
        partialCaptures++;
        const missing = getMissingHeaders(headers);
        console.log(`⚠ Partial capture #${partialCaptures} - missing: ${missing.join(', ')}`);
      }
    }

    request.continue();
  });

  await page.goto(LOGIN_URL);

  console.log('\n📱 Browser opened. Please log in to Meu Dinheiro.');
  console.log('   The browser will close automatically after capturing all credentials.\n');

  while (!capturedHeaders) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const pages = await browser.pages();
    if (pages.length === 0) {
      throw new Error('Browser was closed before all credentials were captured.');
    }
  }

  await browser.close();

  const result: CapturedHeaders = capturedHeaders;

  const token = result.authorization 
    ? extractTokenFromAuth(result.authorization)
    : extractTokenFromCookie(result.cookie);

  const auth: AuthConfig = {
    token,
    apiKey: result.mdapikey,
    policy: result.mdpolicy,
    signature: result.mdsignature,
    uid: result.mduid,
  };

  const missingFields = validateCapturedAuth(auth);
  if (missingFields.length > 0) {
    throw new Error(`Authentication incomplete. Missing: ${missingFields.join(', ')}`);
  }

  return auth;
}

async function waitForSelector(page: Page, selector: string, timeout = 30000): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout });
}

async function setupAuthCapture(
  page: Page,
  onCaptured: (headers: CapturedHeaders) => void
): Promise<void> {
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = request.url();

    if (url.includes(API_URL_PATTERN)) {
      const headers = request.headers();

      if (hasAllRequiredHeaders(headers)) {
        onCaptured({
          authorization: headers['authorization'],
          cookie: headers['cookie'] ?? '',
          mdapikey: headers['mdapikey'],
          mdpolicy: headers['mdpolicy'],
          mdsignature: headers['mdsignature'],
          mduid: headers['mduid'],
        });
      }
    }

    request.continue();
  });
}

function headersToAuthConfig(headers: CapturedHeaders): AuthConfig {
  const token = headers.authorization
    ? extractTokenFromAuth(headers.authorization)
    : extractTokenFromCookie(headers.cookie);

  return {
    token,
    apiKey: headers.mdapikey,
    policy: headers.mdpolicy,
    signature: headers.mdsignature,
    uid: headers.mduid,
  };
}

export async function captureAuthHeadless(opItemName: string): Promise<AuthConfig> {
  const credentials = await getCredentialsFromOnePassword(opItemName);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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

  await setupAuthCapture(page, (headers) => {
    capturedRef.headers = headers;
  });

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
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
