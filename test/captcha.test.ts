import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { detectRecaptchaChallenge, solveRecaptcha } from '../src/lib/captcha.js';

const configDir = process.env.MDCLI_CONFIG_DIR!;

function writeConfig(config: object): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'mdcli.config.json'), JSON.stringify(config, null, 2));
}

function fakePage(overrides: {
  evaluateResult?: unknown;
  content?: string;
  url?: string;
}): Page {
  return {
    evaluate: async () => overrides.evaluateResult ?? null,
    content: async () => overrides.content ?? '<html></html>',
    url: () => overrides.url ?? 'https://example.com/login',
  } as unknown as Page;
}

beforeEach(() => {
  writeConfig({});
});

afterEach(() => {
  rmSync(join(configDir, 'mdcli.config.json'), { force: true });
});

describe('solveRecaptcha', () => {
  test('returns false when no 2captcha API key is configured', async () => {
    const ok = await solveRecaptcha(fakePage({}));
    expect(ok).toBe(false);
  });

  test('returns false when the sitekey cannot be extracted', async () => {
    writeConfig({ captchaApiKey: 'test-key' });

    const ok = await solveRecaptcha(
      fakePage({
        evaluateResult: null,
        content: '<html><body>no captcha here</body></html>',
      })
    );

    expect(ok).toBe(false);
  });
});

describe('detectRecaptchaChallenge', () => {
  test('returns the boolean from page.evaluate', async () => {
    expect(await detectRecaptchaChallenge(fakePage({ evaluateResult: true }))).toBe(true);
    expect(await detectRecaptchaChallenge(fakePage({ evaluateResult: false }))).toBe(false);
  }, 10_000);
});
