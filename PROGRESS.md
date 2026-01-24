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

### Task 3.5: Convert to AuthConfig format [DONE]

- Replaced placeholder error with actual `AuthConfig` return statement in `extractSessionFromBrowser()`:
  - Returns `token` from `mdauthtoken0` cookie
  - Returns `apiKey` from `loginConfig.mdApiKey`
  - Returns `policy` from `loginConfig.mdPolicy` (URL-decoded via `decodeURIComponent`)
  - Returns `signature` from `loginConfig.mdSignature` (URL-decoded via `decodeURIComponent`)
  - Returns `uid` from `loginConfig.uid` (converted to string)
- Added validation for required fields (`mdApiKey`, `mdPolicy`, `mdSignature`) with descriptive error message
- Verification: `bun run typecheck` passes, `bun run lint` passes
- Note: `bun run knip` still flags `browser-session.ts` and `playwright` as unused - expected until Task 4.2

**Phase 3 (Config Extraction) is now COMPLETE.**

### Task 4.1: Add --session option to auth login [DONE]

- Added `-s, --session [browser]` option to `auth login` command in `src/commands/auth.ts`:
  - Import `extractSessionFromBrowser` from `browser-session.ts`
  - Added `session?: boolean | string` to loginAction options type
  - Implemented session handling: defaults to 'chrome' when flag provided without argument
  - Validates browser type (must be 'chrome' or 'firefox')
  - Logs browser name before extraction (e.g., "Extracting session from Chrome...")
- Removed unused exports from `src/lib/browser-session.ts`:
  - `getChromeProfilePath`, `getFirefoxProfilePath`, `copyProfileToTemp`, `cleanupTempDir` are now internal (non-exported)
  - Only `extractSessionFromBrowser` and `BrowserSessionOptions` are exported
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes
- Verification: `mdcli auth login --help` shows the new `--session` option

### Task 4.2: Implement session extraction in loginAction [DONE]

- Already implemented as part of Task 4.1
- The session extraction logic (calling `extractSessionFromBrowser()` when `--session` is used) was included in the Task 4.1 implementation
- Verification: Code review confirms lines 84-90 in auth.ts implement the expected behavior

### Task 4.3: Make browser session the default auth method [DONE]

- Modified `loginAction` in `src/commands/auth.ts` to:
  - Try browser session extraction first when no options are provided (`mdcli auth login`)
  - Fall back to 1Password authentication if browser session extraction fails
  - Log warning message with failure reason before falling back
  - Explicit `--item` flag still directly uses 1Password without trying browser first
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes

### Task 4.4: Add fallback flow when session extraction fails [DONE]

- Modified `loginAction` in `src/commands/auth.ts` to provide an interactive fallback when Chrome session extraction fails:
  - Added `select` import from `@inquirer/prompts`
  - When session extraction fails, displays the error with `logger.warning()`
  - Shows interactive prompt with 5 options:
    1. 1Password (automatic login)
    2. Try Firefox session instead
    3. Open browser for manual login
    4. Enter credentials manually
    5. Cancel
  - User can select their preferred authentication method instead of automatic 1Password fallback
  - Each fallback option triggers the appropriate existing authentication flow
  - "Cancel" option gracefully exits without error
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes

**Phase 4 (CLI Integration) is now COMPLETE.**

### Task 5.1: Add Chrome not found error [DONE]

- Already implemented as part of Task 2.1
- `getChromeProfilePath()` already throws descriptive error if Chrome profile path doesn't exist
- Error message includes suggestion to try `--session firefox` or `--browser`
- Verification: Code review confirms lines 40-42 in browser-session.ts implement the expected behavior

### Task 5.2: Add user not logged in error [DONE]

- Already implemented as part of Task 3.4
- `extractSessionFromBrowser()` throws if `loginConfig.uid` is null or undefined
- Error message suggests `mdcli auth login --browser`
- Verification: Code review confirms lines 199-201 in browser-session.ts implement the expected behavior

### Task 5.3: Add profile access permission error [DONE]

- Added try/catch in `copyProfileToTemp()` to handle EACCES errors during profile copy
- On EACCES error, throws descriptive error: "Cannot access browser profile at: {path}\nPermission denied. Check file permissions or close the browser and try again."
- Also cleans up the temp directory on copy failure to prevent orphan directories
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes

### Task 5.4: Add loginconfig not found error [DONE]

- Already implemented as part of Task 3.5
- `extractSessionFromBrowser()` throws if required loginconfig fields (mdApiKey, mdPolicy, mdSignature) are missing
- Error message: "Failed to extract authentication config from page. The site structure may have changed.\nTry: mdcli auth login --browser"
- Verification: Code review confirms lines 203-207 in browser-session.ts implement the expected behavior

**Tasks 5.1-5.4 (Error Handling) are now COMPLETE.**

### Task 5.5: Update auth status to show session source [DONE]

- Added `AuthMethod` type to `src/types/index.ts`:
  - Type union: `'browser-chrome' | 'browser-firefox' | '1password' | 'browser-manual' | 'manual'`
- Added `authMethod` field to `MdcliConfig` interface
- Updated `src/lib/config.ts`:
  - Added `getAuthMethod()` function to retrieve the auth method
  - Updated `setAuth()` to accept optional `method` parameter and save it to config
- Updated `src/commands/auth.ts`:
  - Added `formatAuthMethod()` helper to convert method to user-friendly label
  - Updated `loginAction` to track and save auth method for each authentication path
  - Updated `statusAction` to display "Auth method" field (e.g., "Browser session (Chrome)")
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes

**Phase 5 (Error Handling & Polish) is now COMPLETE.**

### Task 6.6: Update README with new auth flow [DONE]

- Updated `README.md` to document the new browser session authentication:
  - Updated Usage section to show browser session extraction as the default
  - Added new "Authentication" section documenting all auth methods:
    - Browser Session (Default) with Chrome/Firefox options
    - 1Password (Automatic) for fallback
    - Browser Login (Manual) option
    - Check Status command
  - Updated Features table to add "Browser session extraction (Chrome/Firefox)"
- Verification: `bun run typecheck` passes, `bun run lint` passes, `bun run knip` passes

**Phase 6 Documentation is COMPLETE.**

**Remaining**: Tasks 6.1-6.5 require manual testing by user (browser interaction)
