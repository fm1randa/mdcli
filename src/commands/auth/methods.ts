import { input, password, select } from '@inquirer/prompts';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { getOpItem, setOpItem } from '../../lib/config.js';
import { captureAuthFromBrowser, captureAuthHeadless } from '../../lib/browser-auth.js';
import { extractSessionFromBrowser } from '../../lib/browser-session/index.js';
import type { AuthConfig, AuthMethod } from '../../types/index.js';

async function promptManualAuth(): Promise<AuthConfig> {
  logger.info(t('authManualIntro'));
  logger.blank();

  const apiKey = await input({
    message: t('authApiKeyPrompt'),
    validate: (value) => (value.trim() !== '' ? true : t('authApiKeyRequired')),
  });

  const uid = await input({
    message: t('authUidPrompt'),
    validate: (value) => (value.trim() !== '' ? true : t('authUidRequired')),
  });

  const token = await password({
    message: t('authBearerTokenPrompt'),
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
    message: t('authOpItemPrompt'),
    default: 'MeuDinheiroWeb',
  });
}

export interface LoginAttempt {
  auth: AuthConfig;
  method: AuthMethod;
}

export async function runChromeSession(): Promise<LoginAttempt> {
  logger.info(t('authExtractingChrome'));
  const auth = await extractSessionFromBrowser({ browser: 'chrome' });
  return { auth, method: 'browser-chrome' };
}

export async function runEdgeSession(): Promise<LoginAttempt> {
  logger.info(t('authExtractingEdge'));
  const auth = await extractSessionFromBrowser({ browser: 'edge' });
  return { auth, method: 'browser-edge' };
}

export async function runFirefoxSession(): Promise<LoginAttempt> {
  logger.info(t('authExtractingFirefox'));
  const auth = await extractSessionFromBrowser({ browser: 'firefox' });
  return { auth, method: 'browser-firefox' };
}

export async function runOnePassword(itemOverride?: string): Promise<LoginAttempt> {
  const itemName = await resolveOpItemName(itemOverride);
  const isNewItem = getOpItem() !== itemName;

  logger.info(t('authStartingOnePassword', itemName));
  const auth = await captureAuthHeadless(itemName);

  if (isNewItem) {
    setOpItem(itemName);
    logger.info(t('authOpItemSaved', itemName));
    logger.info(t('authOpItemChangeHint'));
  }

  return { auth, method: '1password' };
}

export async function runBrowserManual(): Promise<LoginAttempt> {
  logger.info(t('authStartingBrowser'));
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
    { value: 'chrome', name: t('authFallbackChrome'), method: 'browser-chrome' },
    { value: 'edge', name: t('authFallbackEdge'), method: 'browser-edge' },
    { value: 'firefox', name: t('authFallbackFirefox'), method: 'browser-firefox' },
    { value: '1password', name: t('authFallbackOnePassword'), method: '1password' },
    { value: 'browser', name: t('authFallbackBrowser'), method: 'browser-manual' },
    { value: 'manual', name: t('authFallbackManual'), method: 'manual' },
  ];

  const choices = allChoices.filter((c) => c.method !== excludeMethod);

  const fallbackChoice = await select({
    message: t('authChooseMethod'),
    choices: [...choices.map(({ value, name }) => ({ value, name })), { value: 'abort', name: t('authCancel') }],
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
