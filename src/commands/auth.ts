import { Command } from 'commander';
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
import { extractSessionFromBrowser } from '../lib/browser-session.js';
import type { AuthConfig, AuthMethod } from '../types/index.js';

async function promptManualAuth(): Promise<AuthConfig> {
  logger.info('Enter the authentication headers from your browser dev tools:');
  logger.blank();

  const token = await password({
    message: 'Bearer Token (Authorization header value without "Bearer "):',
    mask: '*',
  });

  const apiKey = await input({
    message: 'Mdapikey:',
  });

  const policy = await input({
    message: 'Mdpolicy:',
  });

  const signature = await input({
    message: 'Mdsignature:',
  });

  const uid = await input({
    message: 'Mduid:',
  });

  return { token, apiKey, policy, signature, uid };
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

    let auth: AuthConfig;
    let method: AuthMethod;

    if (options.manual) {
      auth = await promptManualAuth();
      method = 'manual';
    } else if (options.browser) {
      logger.info('Starting browser authentication...');
      auth = await captureAuthFromBrowser();
      method = 'browser-manual';
    } else if (options.session) {
      const browserType = options.session === true ? 'chrome' : options.session;
      if (browserType !== 'chrome' && browserType !== 'firefox') {
        throw new Error(`Invalid browser type: ${browserType}. Use "chrome" or "firefox".`);
      }
      logger.info(`Extracting session from ${browserType === 'chrome' ? 'Chrome' : 'Firefox'}...`);
      auth = await extractSessionFromBrowser({ browser: browserType });
      method = browserType === 'chrome' ? 'browser-chrome' : 'browser-firefox';
    } else if (options.item) {
      const itemName = await resolveOpItemName(options.item);
      const isNewItem = getOpItem() !== itemName;

      logger.info(`Starting automatic authentication via 1Password (${itemName})...`);
      auth = await captureAuthHeadless(itemName);
      method = '1password';

      if (isNewItem) {
        setOpItem(itemName);
        logger.info(`1Password item "${itemName}" saved to config.`);
        logger.info('To change it, run: mdcli auth login --item <new-name>');
      }
    } else {
      try {
        logger.info('Extracting session from Chrome...');
        auth = await extractSessionFromBrowser({ browser: 'chrome' });
        method = 'browser-chrome';
      } catch (sessionError) {
        const sessionMessage = sessionError instanceof Error ? sessionError.message : 'Unknown error';
        logger.warning(`Browser session extraction failed: ${sessionMessage}`);
        logger.blank();

        const fallbackChoice = await select({
          message: 'How would you like to authenticate?',
          choices: [
            { value: '1password', name: '1Password (automatic login)' },
            { value: 'firefox', name: 'Try Firefox session instead' },
            { value: 'browser', name: 'Open browser for manual login' },
            { value: 'manual', name: 'Enter credentials manually' },
            { value: 'abort', name: 'Cancel' },
          ],
        });

        if (fallbackChoice === 'abort') {
          logger.info('Authentication cancelled.');
          return;
        }

        if (fallbackChoice === '1password') {
          const itemName = await resolveOpItemName(undefined);
          const isNewItem = getOpItem() !== itemName;

          logger.info(`Starting automatic authentication via 1Password (${itemName})...`);
          auth = await captureAuthHeadless(itemName);
          method = '1password';

          if (isNewItem) {
            setOpItem(itemName);
            logger.info(`1Password item "${itemName}" saved to config.`);
            logger.info('To change it, run: mdcli auth login --item <new-name>');
          }
        } else if (fallbackChoice === 'firefox') {
          logger.info('Extracting session from Firefox...');
          auth = await extractSessionFromBrowser({ browser: 'firefox' });
          method = 'browser-firefox';
        } else if (fallbackChoice === 'browser') {
          logger.info('Starting browser authentication...');
          auth = await captureAuthFromBrowser();
          method = 'browser-manual';
        } else {
          auth = await promptManualAuth();
          method = 'manual';
        }
      }
    }

    setAuth(auth, method);
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

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Meu Dinheiro (uses 1Password by default)')
  .option('-m, --manual', 'Manually enter authentication headers')
  .option('-b, --browser', 'Open browser for manual login')
  .option('-s, --session [browser]', 'Extract session from browser profile (chrome|firefox)')
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
