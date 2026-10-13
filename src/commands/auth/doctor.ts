import { $ } from 'bun';
import { logger } from '../../utils/logger.js';
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
