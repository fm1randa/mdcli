import { logger } from '../../utils/logger.js';
import { getAuth, getAuthMethod, clearAuth, hasAuth, getConfigPath, getFullConfig, getOpItem, getCaptchaApiKey } from '../../lib/config.js';
import type { AuthMethod } from '../../types/index.js';

export function formatAuthMethod(method: AuthMethod | null): string {
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

export function statusAction(): void {
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

export function logoutAction(options: { all?: boolean }): void {
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
