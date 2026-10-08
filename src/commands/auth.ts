import { Command } from 'commander';
import { $ } from 'bun';
import { input, password, select } from '@inquirer/prompts';
import { logger } from '../utils/logger.js';
import {
  getAuth,
  getAuthMethod,
  setAuth,
  clearAuth,
  hasAuth,
  getConfigPath,
  getFullConfig,
  getOpItem,
  setOpItem,
  getCaptchaApiKey,
  setCaptchaApiKey,
} from '../lib/config.js';
import { captureAuthFromBrowser, captureAuthHeadless } from '../lib/browser-auth.js';
import {
  extractSessionFromBrowser,
  getChromeProfilePath,
  getEdgeProfilePath,
  getFirefoxProfilePath,
  checkChromeProfileReadable,
  checkEdgeProfileReadable,
} from '../lib/browser-session.js';
import type { AuthConfig, AuthMethod } from '../types/index.js';

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

interface LoginAttempt {
  auth: AuthConfig;
  method: AuthMethod;
}

async function runChromeSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Chrome...');
  const auth = await extractSessionFromBrowser({ browser: 'chrome' });
  return { auth, method: 'browser-chrome' };
}

async function runEdgeSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Edge...');
  const auth = await extractSessionFromBrowser({ browser: 'edge' });
  return { auth, method: 'browser-edge' };
}

async function runFirefoxSession(): Promise<LoginAttempt> {
  logger.info('Extracting session from Firefox...');
  const auth = await extractSessionFromBrowser({ browser: 'firefox' });
  return { auth, method: 'browser-firefox' };
}

async function runOnePassword(itemOverride?: string): Promise<LoginAttempt> {
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

async function runBrowserManual(): Promise<LoginAttempt> {
  logger.info('Starting browser authentication...');
  const auth = await captureAuthFromBrowser();
  return { auth, method: 'browser-manual' };
}

async function runManualEntry(): Promise<LoginAttempt> {
  const auth = await promptManualAuth();
  return { auth, method: 'manual' };
}

function runPreferredMethod(method: AuthMethod): Promise<LoginAttempt> {
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

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function runFallbackPrompt(excludeMethod: AuthMethod): Promise<LoginAttempt | null> {
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

async function loginAction(options: {
  manual?: boolean;
  browser?: boolean;
  session?: boolean | string;
  item?: string;
  captchaKey?: string;
}): Promise<void> {
  try {
    if (options.captchaKey) {
      setCaptchaApiKey(options.captchaKey);
      logger.info('2captcha API key saved to config.');
      logger.info('To change it, run: mdcli auth login --captcha-key <new-key>');
    }

    let result: LoginAttempt;

    if (options.manual) {
      result = await runManualEntry();
    } else if (options.browser) {
      result = await runBrowserManual();
    } else if (options.session) {
      const browserType = options.session === true ? 'chrome' : options.session;
      if (browserType !== 'chrome' && browserType !== 'firefox' && browserType !== 'edge') {
        throw new Error(`Invalid browser type: ${browserType}. Use "chrome", "edge", or "firefox".`);
      }
      result =
        browserType === 'chrome'
          ? await runChromeSession()
          : browserType === 'edge'
            ? await runEdgeSession()
            : await runFirefoxSession();
    } else if (options.item) {
      result = await runOnePassword(options.item);
    } else {
      const savedMethod = getAuthMethod();
      const primaryMethod: AuthMethod = savedMethod && savedMethod !== 'manual' ? savedMethod : 'browser-chrome';

      if (savedMethod && savedMethod !== 'manual') {
        logger.info(`Trying last used method: ${formatAuthMethod(savedMethod)}`);
      }

      try {
        result = await runPreferredMethod(primaryMethod);
      } catch (primaryError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : 'Unknown error';
        logger.warning(`${formatAuthMethod(primaryMethod)} failed: ${primaryMessage}`);
        logger.blank();

        if (!isInteractiveTerminal()) {
          throw new Error(
            'No interactive terminal available to choose a fallback method.\n' +
              'Use one of: --session chrome, --session firefox, --item <name>, --browser, --manual'
          );
        }

        const fallbackResult = await runFallbackPrompt(primaryMethod);
        if (!fallbackResult) {
          logger.info('Authentication cancelled.');
          return;
        }
        result = fallbackResult;
      }
    }

    setAuth(result.auth, result.method);
    logger.success('Authentication saved successfully!');
    logger.log(`  Config file: ${getConfigPath()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Authentication failed: ${message}`);
    process.exit(1);
  }
}

function formatAuthMethod(method: AuthMethod | null): string {
  if (!method) return '(unknown)';
  
  const labels: Record<AuthMethod, string> = {
    'browser-chrome': 'Browser session (Chrome)',
    'browser-edge': 'Browser session (Edge)',
    'browser-firefox': 'Browser session (Firefox)',
    '1password': '1Password',
    'browser-manual': 'Browser (manual login)',
    'manual': 'Manual entry',
  };
  
  return labels[method];
}

function statusAction(): void {
  const configPath = getConfigPath();
  const config = getFullConfig();
  const auth = getAuth();
  const authMethod = getAuthMethod();
  const opItem = getOpItem();
  const captchaKey = getCaptchaApiKey();

  logger.header('Authentication Status');

  logger.kv('Config file', configPath);
  logger.kv('Last updated', config.lastUpdated ?? null);
  logger.kv('Authenticated', hasAuth() ? 'Yes' : 'No');
  logger.kv('Auth method', auth ? formatAuthMethod(authMethod) : null);
  logger.kv('1Password item', opItem ?? '(not configured)');
  logger.kv('2captcha API key', captchaKey ? `${captchaKey.slice(0, 8)}...` : '(not configured)');

  if (auth) {
    logger.blank();
    logger.kv('Token', auth.token ? `${auth.token.slice(0, 20)}...` : null);
    logger.kv('API Key', auth.apiKey ? `${auth.apiKey.slice(0, 10)}...` : null);
    logger.kv('UID', auth.uid);
  }

  logger.blank();
}

function logoutAction(options: { all?: boolean }): void {
  const wasAuthenticated = hasAuth();
  clearAuth(options.all);

  if (wasAuthenticated) {
    logger.success('Logged out. Stored credentials removed.');
  } else {
    logger.info('No active session was found.');
  }

  if (options.all) {
    logger.info('Also cleared the saved 1Password item and 2captcha API key.');
  }

  logger.log(`  Config file: ${getConfigPath()}`);
}

async function checkOnePasswordCli(): Promise<boolean> {
  try {
    await $`op --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function doctorAction(): Promise<void> {
  logger.header('Authentication Doctor');

  logger.kv('Platform', process.platform);
  logger.blank();

  try {
    getChromeProfilePath();
    const readable = checkChromeProfileReadable();
    if (readable.ok) {
      logger.success('Chrome profile found and readable');
    } else {
      logger.error(`Chrome profile found but not readable: ${readable.reason}`);
    }
  } catch (error) {
    logger.warning(`Chrome profile not found: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  try {
    getEdgeProfilePath();
    const readable = checkEdgeProfileReadable();
    if (readable.ok) {
      logger.success('Edge profile found and readable');
    } else {
      logger.error(`Edge profile found but not readable: ${readable.reason}`);
    }
  } catch (error) {
    logger.warning(`Edge profile not found: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  try {
    const firefoxProfile = getFirefoxProfilePath();
    logger.success(`Firefox profile found: ${firefoxProfile}`);
  } catch (error) {
    logger.warning(`Firefox profile not found: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (await checkOnePasswordCli()) {
    logger.success('1Password CLI ("op") found on PATH');
  } else {
    logger.warning('1Password CLI ("op") not found. Install: https://developer.1password.com/docs/cli/get-started/');
  }

  const captchaKey = getCaptchaApiKey();
  if (captchaKey) {
    logger.success('2captcha API key configured');
  } else {
    logger.info('2captcha API key not configured (only needed if login shows a reCAPTCHA challenge)');
  }

  logger.blank();
  if (hasAuth()) {
    logger.success(`Currently authenticated via ${formatAuthMethod(getAuthMethod())}`);
  } else {
    logger.warning('Not currently authenticated. Run "mdcli auth login".');
  }

  logger.blank();
}

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Meu Dinheiro (uses 1Password by default)')
  .option('-m, --manual', 'Manually enter authentication headers')
  .option('-b, --browser', 'Open browser for manual login')
  .option('-s, --session [browser]', 'Extract session from browser profile (chrome|edge|firefox)')
  .option('-i, --item <name>', '1Password item name (saved to config)')
  .option('-c, --captcha-key <key>', '2captcha API key for solving reCAPTCHA (saved to config)')
  .action(loginAction);

authCommand
  .command('status')
  .description('Show current authentication status')
  .action(statusAction);

authCommand
  .command('logout')
  .description('Remove the stored session (use --all to also clear the saved 1Password item and 2captcha key)')
  .option('--all', 'Also clear the saved 1Password item and 2captcha API key')
  .action(logoutAction);

authCommand
  .command('doctor')
  .description('Diagnose common authentication problems (browser profiles, 1Password CLI, current session)')
  .action(doctorAction);
