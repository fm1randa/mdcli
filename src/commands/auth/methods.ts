import { input, password, select } from '@inquirer/prompts';
import { logger } from '../../utils/logger.js';
import { getOpItem, setOpItem } from '../../lib/config.js';
import { captureAuthFromBrowser, captureAuthHeadless } from '../../lib/browser-auth.js';
import { extractSessionFromBrowser } from '../../lib/browser-session/index.js';
import type { AuthConfig, AuthMethod } from '../../types/index.js';

async function promptManualAuth(): Promise<AuthConfig> {
  logger.info('Enter the authentication headers from your browser dev tools (Network tab, any request to /api/):');
  logger.blank();

  const apiKey = await input({
    message: 'Mdapikey:',
    validate: (value) => (value.trim() !== '' ? true : 'Mdapikey is required'),
  });

  const uid = await input({
    message: 'Mduid:',
    validate: (value) => (value.trim() !== '' ? true : 'Mduid is required'),
  });

  const token = await password({
    message: 'Bearer Token (Authorization header value without "Bearer ", leave blank if not present):',
    mask: '*',
  });

  return { apiKey, uid, ...(token ? { token } : {}) };
}

async function resolveOpItemName(providedItem?: string): Promise<string> {
  if (providedItem) {
    return providedItem;
  }

  const savedItem = getOpItem();
  if (savedItem) {
    return savedItem;
  }

  return input({
    message: '1Password item name for Meu Dinheiro credentials:',
    default: 'MeuDinheiroWeb',
  });
}

export interface LoginAttempt {
  auth: AuthConfig;
  method: AuthMethod;
}

export async function runChromeSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Chrome...');
  const auth = await extractSessionFromBrowser({ browser: 'chrome' });
  return { auth, method: 'browser-chrome' };
}

export async function runEdgeSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Edge...');
  const auth = await extractSessionFromBrowser({ browser: 'edge' });
  return { auth, method: 'browser-edge' };
}

export async function runFirefoxSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Firefox...');
  const auth = await extractSessionFromBrowser({ browser: 'firefox' });
  return { auth, method: 'browser-firefox' };
}

export async function runOnePassword(itemOverride?: string): Promise<LoginAttempt> {
  const itemName = await resolveOpItemName(itemOverride);
  const isNewItem = getOpItem() !== itemName;

  logger.info(`Starting automatic authentication via 1Password (${itemName})...`);
  const auth = await captureAuthHeadless(itemName);

  if (isNewItem) {
    setOpItem(itemName);
    logger.info(`1Password item "${itemName}" saved to config.`);
    logger.info('To change it, run: mdcli auth login --item <new-name>');
  }

  return { auth, method: '1password' };
}

export async function runBrowserManual(): Promise<LoginAttempt> {
  logger.info('Starting browser authentication...');
  const auth = await captureAuthFromBrowser();
  return { auth, method: 'browser-manual' };
}

export async function runManualEntry(): Promise<LoginAttempt> {
  const auth = await promptManualAuth();
  return { auth, method: 'manual' };
}

export function runPreferredMethod(method: AuthMethod): Promise<LoginAttempt> {
  switch (method) {
    case 'browser-chrome':
      return runChromeSession();
    case 'browser-edge':
      return runEdgeSession();
    case 'browser-firefox':
      return runFirefoxSession();
    case '1password':
      return runOnePassword();
    case 'browser-manual':
      return runBrowserManual();
    case 'manual':
      return runManualEntry();
  }
}

export function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function runFallbackPrompt(excludeMethod: AuthMethod): Promise<LoginAttempt | null> {
  const allChoices: { value: string; name: string; method: AuthMethod }[] = [
    { value: 'chrome', name: 'Try Chrome session again', method: 'browser-chrome' },
    { value: 'edge', name: 'Try Edge session instead', method: 'browser-edge' },
    { value: 'firefox', name: 'Try Firefox session instead', method: 'browser-firefox' },
    { value: '1password', name: '1Password (automatic login)', method: '1password' },
    { value: 'browser', name: 'Open browser for manual login', method: 'browser-manual' },
    { value: 'manual', name: 'Enter credentials manually', method: 'manual' },
  ];

  const choices = allChoices.filter((c) => c.method !== excludeMethod);

  const fallbackChoice = await select({
    message: 'How would you like to authenticate?',
    choices: [...choices.map(({ value, name }) => ({ value, name })), { value: 'abort', name: 'Cancel' }],
  });

  switch (fallbackChoice) {
    case 'chrome':
      return runChromeSession();
    case 'edge':
      return runEdgeSession();
    case 'firefox':
      return runFirefoxSession();
    case '1password':
      return runOnePassword();
    case 'browser':
      return runBrowserManual();
    case 'manual':
      return runManualEntry();
    default:
      return null;
  }
}
