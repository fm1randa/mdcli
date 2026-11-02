import type { ptBRInternals as SectionType } from '../pt-BR/internals.js';

/** API and auth internals, in English. Typed by the pt-BR section, so a missing key fails typecheck. */

export const enInternals: typeof SectionType = {
  // --- API and auth internals ----------------------------------------------------
  errorReauth: () =>
    'The API rejected the saved credentials (401). Run "mdcli auth login" to re-authenticate.',
  refreshingCredentials: () => '🔄 Credentials rejected, refreshing with the last login method...',
  credentialsRefreshed: () => '✓ Credentials refreshed',
  errorApiRequestFailed: (context, status, statusText, body) =>
    `API request failed (${context}): ${status} ${statusText} - ${body}`,
  errorApiInvalidJson: (context, reason) =>
    `API returned invalid JSON (${context}): ${reason}`,
  errorNotAuthenticated: () => 'Not authenticated. Run "mdcli auth login" first.',
  contextAfterRefresh: (context) => `${context}, after refresh`,
  captchaNoApiKey: () => '⚠ reCAPTCHA detected but no 2captcha API key configured.',
  captchaConfigureHint: () =>
    '  Run: mdcli auth login --captcha-key <your-2captcha-api-key>',
  captchaSitekeyMissing: () => '⚠ Could not extract reCAPTCHA sitekey from page',
  captchaSolving: () => '🔐 Solving reCAPTCHA challenge...',
  captchaSolved: () => '✓ reCAPTCHA solved',
  captchaSolveFailed: (message) => `⚠ Failed to solve reCAPTCHA: ${message}`,
  authHeadersCaptured: () => '✓ Authentication headers captured successfully.',
  authBrowserOpened: () =>
    '\n📱 Browser opened. Please log in to Meu Dinheiro.\n' +
    '   The browser will close automatically after capturing all credentials.\n',
  errorBrowserClosedEarly: () =>
    'Browser was closed before all credentials were captured.',
  errorAuthIncomplete: (missing) => `Authentication incomplete. Missing: ${missing}`,
  errorCaptchaNotSolved: () => 'Failed to solve reCAPTCHA challenge',
  errorOtpMaxRetries: () => 'OTP validation failed after maximum retries',
  otpInvalidRetry: (attempt, max) =>
    `OTP invalid, fetching fresh code (attempt ${attempt}/${max})...`,
  errorAuthCaptureFailed: () =>
    'Failed to capture authentication headers after login',
  errorUnsupportedPlatform: (platform) =>
    `Unsupported platform: ${platform}. Only macOS, Windows, and Linux are supported.`,
  errorBrowserProfileNotFound: (label, path) =>
    `${label} not found. Expected profile at: ${path}\nTry: mdcli auth login --session firefox or --browser`,
  warningTempProfileRemoveFailed: (path) =>
    `⚠ Could not remove temporary profile copy at ${path}. You can delete it manually.`,
  errorNotLoggedIn: () =>
    'User is not logged into MeuDinheiro. Try: mdcli auth login --browser',
  errorUserIdUnknown: () =>
    'Could not determine user ID. Try: mdcli auth login --browser',
  errorFirefoxNotFound: (path) =>
    `Firefox not found. Expected at: ${path}\nTry: mdcli auth login --session chrome or --browser`,
  errorFirefoxProfilesIniNotFound: (path) =>
    `Firefox profiles.ini not found at: ${path}\nTry: mdcli auth login --session chrome or --browser`,
  errorNoFirefoxProfiles: (path) =>
    `No Firefox profiles found in: ${path}\nTry: mdcli auth login --session chrome or --browser`,
  errorFirefoxProfileNotFound: (path) =>
    `Firefox profile not found at: ${path}\nTry: mdcli auth login --session chrome or --browser`,
  errorMissingOnePasswordCredentials: (missing) =>
    `Missing credentials from 1Password: ${missing}`,
  errorInvalidInvoiceMonth: (value) =>
    `Invalid invoice month "${value}". Use YYYY-MM with a month from 01 to 12 (e.g., 2026-10)`,
  updateInstalled: (from, to) => `mdcli updated from ${from} to ${to}`,
  updateNotGlobal: () =>
    '✗ mdcli is not installed globally (bun install -g github:fm1randa/mdcli); in a checkout, use git pull.',
  updateCheckFailed: () => '✗ Could not reach the latest release on GitHub.',
  updateAlreadyLatest: (version) => `mdcli is already on the latest version (${version}).`,
  updateUpdating: (from, to) => `Updating mdcli from ${from} to ${to}...`,
  updateInstallFailed: (tag, code) =>
    `✗ Failed to install ${tag} (bun exited with code ${code}). Manual recovery: bun install -g github:fm1randa/mdcli#${tag}.`,
  updateRemoveFailed: (code) =>
    `✗ Failed to remove the old mdcli installation (bun exited with code ${code}). The update was cancelled before installing the new version; run \`mdcli update\` again to retry.`,
};
