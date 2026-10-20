import { logger } from '../../utils/logger.js';
import { exitWithError } from '../../utils/action.js';
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
              'Use one of: --session chrome, --session firefox, --item <name>, --browser, --manual',
            { cause: primaryError }
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
    exitWithError(`Authentication failed: ${message}`);
  }
}
