import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { getAuth, getAuthMethod, clearAuth, hasAuth, getConfigPath, getFullConfig, getOpItem, getCaptchaApiKey } from '../../lib/config.js';
import type { AuthMethod } from '../../types/index.js';

export function formatAuthMethod(method: AuthMethod | null): string {
  if (!method) return t('authMethodUnknown');

  const labels: Record<AuthMethod, () => string> = {
    'browser-chrome': () => t('authMethodBrowserChrome'),
    'browser-edge': () => t('authMethodBrowserEdge'),
    'browser-firefox': () => t('authMethodBrowserFirefox'),
    '1password': () => t('authMethodOnePassword'),
    'browser-manual': () => t('authMethodBrowserManual'),
    'manual': () => t('authMethodManual'),
  };

  return labels[method]();
}

export function statusAction(): void {
  const configPath = getConfigPath();
  const config = getFullConfig();
  const auth = getAuth();
  const authMethod = getAuthMethod();
  const opItem = getOpItem();
  const captchaKey = getCaptchaApiKey();

  logger.header(t('authStatusHeader'));

  logger.kv(t('labelConfigFile'), configPath);
  logger.kv(t('labelLastUpdated'), config.lastUpdated ?? null);
  logger.kv(t('labelAuthenticated'), hasAuth() ? t('yes') : t('no'));
  logger.kv(t('labelAuthMethod'), auth ? formatAuthMethod(authMethod) : null);
  logger.kv(t('labelOnePasswordItem'), opItem ?? t('notConfigured'));
  logger.kv(t('labelCaptchaKey'), captchaKey ? `${captchaKey.slice(0, 8)}...` : t('notConfigured'));

  if (auth) {
    logger.blank();
    logger.kv(t('labelToken'), auth.token ? `${auth.token.slice(0, 20)}...` : null);
    logger.kv(t('labelApiKey'), auth.apiKey ? `${auth.apiKey.slice(0, 10)}...` : null);
    logger.kv(t('labelUid'), auth.uid);
  }

  logger.blank();
}

export function logoutAction(options: { all?: boolean }): void {
  const wasAuthenticated = hasAuth();
  clearAuth(options.all);

  if (wasAuthenticated) {
    logger.success(t('authLogoutSuccess'));
  } else {
    logger.info(t('authNoActiveSession'));
  }

  if (options.all) {
    logger.info(t('authAlsoCleared'));
  }

  logger.log(t('authConfigFile', getConfigPath()));
}
