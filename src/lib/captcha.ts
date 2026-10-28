import Solver from '2captcha';
import type { Page } from 'playwright';
import { getCaptchaApiKey } from './config.js';
import { t } from './i18n/index.js';

const RECAPTCHA_SITEKEY_PATTERN = /sitekey['":\s]+['"]([^'"]+)['"]/i;

export async function detectRecaptchaChallenge(page: Page): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const hasChallenge = await page.evaluate(`
    (function() {
      var challengeFrame = document.querySelector('iframe[src*="recaptcha"][src*="bframe"]');
      if (challengeFrame) return true;

      var recaptchaOverlay = document.querySelector('.grecaptcha-badge');
      if (recaptchaOverlay) {
        var style = window.getComputedStyle(recaptchaOverlay);
        if (style.opacity !== '0' && style.visibility !== 'hidden') return true;
      }

      return false;
    })()
  `);

  return hasChallenge as boolean;
}

async function extractSitekey(page: Page): Promise<string | null> {
  const sitekey = await page.evaluate(`
    (function() {
      var recaptchaDiv = document.querySelector('[data-sitekey]');
      if (recaptchaDiv) {
        return recaptchaDiv.getAttribute('data-sitekey');
      }

      var scripts = Array.from(document.querySelectorAll('script'));
      for (var i = 0; i < scripts.length; i++) {
        var match = scripts[i].innerHTML.match(/sitekey['":\\s]+['"]([^'"]+)['"]/i);
        if (match) return match[1];
      }

      var iframes = Array.from(document.querySelectorAll('iframe[src*="recaptcha"]'));
      for (var j = 0; j < iframes.length; j++) {
        var src = iframes[j].getAttribute('src') || '';
        var iframeMatch = src.match(/[?&]k=([^&]+)/);
        if (iframeMatch) return iframeMatch[1];
      }

      return null;
    })()
  `);

  if (sitekey) return sitekey as string;

  const pageContent = await page.content();
  const match = pageContent.match(RECAPTCHA_SITEKEY_PATTERN);
  return match?.[1] ?? null;
}

function injectRecaptchaToken(token: string): string {
  return `
    (function(captchaToken) {
      var responseField = document.getElementById('g-recaptcha-response');
      if (responseField) {
        responseField.value = captchaToken;
      }

      var hiddenFields = document.querySelectorAll('[name="g-recaptcha-response"]');
      hiddenFields.forEach(function(field) {
        field.value = captchaToken;
      });

      if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
        for (var i = 0; i < window.___grecaptcha_cfg.clients.length; i++) {
          var client = window.___grecaptcha_cfg.clients[i];
          if (!client) continue;
          for (var key in client) {
            var prop = client[key];
            if (prop && typeof prop === 'object') {
              for (var subKey in prop) {
                var subProp = prop[subKey];
                if (subProp && typeof subProp.callback === 'function') {
                  subProp.callback(captchaToken);
                  return;
                }
              }
            }
          }
        }
      }
    })('${token}')
  `;
}

export async function solveRecaptcha(page: Page): Promise<boolean> {
  const apiKey = getCaptchaApiKey();
  if (!apiKey) {
    console.log(t('captchaNoApiKey'));
    console.log(t('captchaConfigureHint'));
    return false;
  }

  const sitekey = await extractSitekey(page);
  if (!sitekey) {
    console.log(t('captchaSitekeyMissing'));
    return false;
  }

  const pageUrl = page.url();
  console.log(t('captchaSolving'));

  try {
    const solver = new Solver.Solver(apiKey);
    const result = await solver.recaptcha(sitekey, pageUrl, {
      invisible: true,
    });

    const token = result.data;
    console.log(t('captchaSolved'));

    await page.evaluate(injectRecaptchaToken(token));

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : t('unknownError');
    console.log(t('captchaSolveFailed', message));
    return false;
  }
}
