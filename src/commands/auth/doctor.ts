import { $ } from 'bun';
import { logger } from '../../utils/logger.js';
import { t } from '../../lib/i18n/index.js';
import { getAuthMethod, hasAuth, getCaptchaApiKey } from '../../lib/config.js';
import { getChromeProfilePath, getEdgeProfilePath, getFirefoxProfilePath, checkChromeProfileReadable, checkEdgeProfileReadable } from '../../lib/browser-session/index.js';
import { formatAuthMethod } from './status.js';

async function checkOnePasswordCli(): Promise<boolean> {
  try {
    await $`op --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

export async function doctorAction(): Promise<void> {
  logger.header(t('authDoctorHeader'));

  logger.kv(t('labelPlatform'), process.platform);
  logger.blank();

  try {
    getChromeProfilePath();
    const readable = checkChromeProfileReadable();
    if (readable.ok) {
      logger.success(t('authChromeProfileOk'));
    } else {
      logger.error(t('authChromeProfileNotReadable', readable.reason));
    }
  } catch (error) {
    logger.warning(t('authChromeProfileNotFound', error instanceof Error ? error.message : t('unknownError')));
  }

  try {
    getEdgeProfilePath();
    const readable = checkEdgeProfileReadable();
    if (readable.ok) {
      logger.success(t('authEdgeProfileOk'));
    } else {
      logger.error(t('authEdgeProfileNotReadable', readable.reason));
    }
  } catch (error) {
    logger.warning(t('authEdgeProfileNotFound', error instanceof Error ? error.message : t('unknownError')));
  }

  try {
    const firefoxProfile = getFirefoxProfilePath();
    logger.success(t('authFirefoxProfileFound', firefoxProfile));
  } catch (error) {
    logger.warning(t('authFirefoxProfileNotFound', error instanceof Error ? error.message : t('unknownError')));
  }

  if (await checkOnePasswordCli()) {
    logger.success(t('authOnePasswordFound'));
  } else {
    logger.warning(t('authOnePasswordNotFound'));
  }

  const captchaKey = getCaptchaApiKey();
  if (captchaKey) {
    logger.success(t('authCaptchaConfigured'));
  } else {
    logger.info(t('authCaptchaNotConfigured'));
  }

  logger.blank();
  if (hasAuth()) {
    logger.success(t('authCurrentlyAuthenticated', formatAuthMethod(getAuthMethod())));
  } else {
    logger.warning(t('authNotAuthenticated'));
  }

  logger.blank();
}
