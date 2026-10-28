import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { getAuthMethod, setAuth, getConfigPath, setCaptchaApiKey } from '../../lib/config.js';
import type { AuthMethod } from '../../types/index.js';
import { type LoginAttempt, isInteractiveTerminal, runBrowserManual, runChromeSession, runEdgeSession, runFallbackPrompt, runFirefoxSession, runManualEntry, runOnePassword, runPreferredMethod } from './methods.js';
import { formatAuthMethod } from './status.js';

export async function loginAction(options: {
  manual?: boolean;
  browser?: boolean;
  session?: boolean | string;
  item?: string;
  captchaKey?: string;
}): Promise<void> {
  try {
    if (options.captchaKey) {
      setCaptchaApiKey(options.captchaKey);
      logger.info(t('authCaptchaSaved'));
      logger.info(t('authCaptchaChangeHint'));
    }

    let result: LoginAttempt;

    if (options.manual) {
      result = await runManualEntry();
    } else if (options.browser) {
      result = await runBrowserManual();
    } else if (options.session) {
      const browserType = options.session === true ? 'chrome' : options.session;
      if (browserType !== 'chrome' && browserType !== 'firefox' && browserType !== 'edge') {
        throw new Error(t('authInvalidBrowserType', browserType));
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
        logger.info(t('authTryingLastMethod', formatAuthMethod(savedMethod)));
      }

      try {
        result = await runPreferredMethod(primaryMethod);
      } catch (primaryError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : t('unknownError');
        logger.warning(t('authMethodFailed', formatAuthMethod(primaryMethod), primaryMessage));
        logger.blank();

        if (!isInteractiveTerminal()) {
          throw new Error(t('authNoInteractiveTerminal'), { cause: primaryError });
        }

        const fallbackResult = await runFallbackPrompt(primaryMethod);
        if (!fallbackResult) {
          logger.info(t('authCancelled'));
          return;
        }
        result = fallbackResult;
      }
    }

    setAuth(result.auth, result.method);
    logger.success(t('authSavedSuccessfully'));
    logger.log(t('authConfigFile', getConfigPath()));
  } catch (error) {
    const message = error instanceof Error ? error.message : t('unknownError');
    exitWithError(t('authFailed', message));
  }
}
