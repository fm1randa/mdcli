# Progress

## 2026-01-24

### Task 1.1: Add Playwright dependency [DONE]

- Added `playwright@1.58.0` to dependencies via `bun add playwright`
- Verification: `bun run typecheck` passes
- Note: `bun run knip` correctly flags playwright as unused - this is expected until Task 1.2 creates `browser-session.ts` which will import it

### Task 1.2: Create browser-session.ts scaffold [DONE]

- Created `src/lib/browser-session.ts` with:
  - `BrowserSessionOptions` interface (browser: 'chrome' | 'firefox', timeout?: number)
  - `extractSessionFromBrowser()` function scaffold returning `Promise<AuthConfig>`
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` flags `browser-session.ts` and `playwright` as unused - this is expected until Task 4.2 integrates the module into auth.ts

### Task 2.1: Implement Chrome profile path detection [DONE]

- Added `getChromeProfilePath()` function to `src/lib/browser-session.ts`:
  - Platform-specific paths for macOS, Windows, and Linux
  - Validates path exists with `existsSync()`
  - Throws descriptive error if Chrome not found (suggests `--session firefox` or `--browser`)
  - Throws error for unsupported platforms
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 2.2: Implement Firefox profile path detection [DONE]

- Added `getFirefoxProfilePath()` function to `src/lib/browser-session.ts`:
  - Platform-specific paths for macOS, Windows, and Linux
  - Parses `profiles.ini` to find all configured profiles
  - Selects the default profile (marked with `Default=1`) or falls back to first profile
  - Handles both relative and absolute profile paths
  - Validates profile path exists with `existsSync()`
  - Throws descriptive errors if Firefox not found, profiles.ini missing, or no profiles found (suggests `--session chrome` or `--browser`)
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 2.3: Implement profile copy to temp directory [DONE]

- Added `copyProfileToTemp()` function to `src/lib/browser-session.ts`:
  - Uses `mkdtemp` from `node:fs/promises` to create temp directory with prefix `mdcli-profile-`
  - Uses `cp` from `node:fs/promises` to recursively copy browser profile
  - Returns the temp directory path for Playwright to use
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 2.4: Implement temp directory cleanup [DONE]

- Added `cleanupTempDir()` function to `src/lib/browser-session.ts`:
  - Imports `rm` from `node:fs/promises`
  - Removes temp directory with `{ recursive: true, force: true }` options
  - Will be called in `finally` block when `extractSessionFromBrowser` is fully implemented in Phase 3
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 3.1: Implement Playwright persistent context launch [DONE]

- Implemented `extractSessionFromBrowser()` function in `src/lib/browser-session.ts`:
  - Accepts `BrowserSessionOptions` with browser type (chrome/firefox, defaults to chrome)
  - Uses `getChromeProfilePath()` or `getFirefoxProfilePath()` based on browser option
  - Copies profile to temp directory using `copyProfileToTemp()`
  - Launches Playwright persistent context with `chromium.launchPersistentContext()` or `firefox.launchPersistentContext()`
  - Uses `channel: 'chrome'` for Chrome to use system browser instead of downloading Chromium
  - Ensures `cleanupTempDir()` is called in `finally` block (even on errors)
  - Throws placeholder error for Tasks 3.2-3.5 (extraction logic not yet implemented)
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 3.2: Navigate and extract window.loginconfig [DONE]

- Added `LoginConfigRaw` interface to `src/lib/browser-session.ts`:
  - Defines shape of `window.loginconfig` object (mdApiKey, mdPolicy, mdSignature, uid)
- Implemented navigation and config extraction in `extractSessionFromBrowser()`:
  - Gets existing page or creates new page from persistent context
  - Navigates to `https://app.meudinheiroweb.com.br/` with `waitUntil: 'domcontentloaded'`
  - Uses `page.evaluate()` with `globalThis` to access browser's `loginconfig` object
  - Returns extracted config as `LoginConfigRaw | null`
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 3.3: Extract JWT token from cookies [DONE]

- Added cookie extraction in `extractSessionFromBrowser()` in `src/lib/browser-session.ts`:
  - Uses `context.cookies()` to get all cookies from the browser context
  - Finds `mdauthtoken0` cookie which contains the JWT token
  - Extracts the cookie value or defaults to empty string if not found
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

### Task 3.4: Handle user not logged in [DONE]

- Added unauthenticated user detection in `extractSessionFromBrowser()` in `src/lib/browser-session.ts`:
  - Checks if `loginConfig` is null (page didn't load correctly or site structure changed)
  - Checks if `loginConfig.uid` is null or undefined (user not authenticated)
  - Throws descriptive error: "User is not logged into MeuDinheiro. Try: mdcli auth login --browser"
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

**Next task**: Task 3.5 - Convert to AuthConfig format
