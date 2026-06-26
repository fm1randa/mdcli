# mdcli

Unofficial CLI client for [Meu Dinheiro](https://meudinheiroweb.com.br) - a Brazilian personal finance app.

## Installation

> Requires [Bun](https://bun.sh). mdcli runs TypeScript directly and relies on Bun-only APIs, so it does not run under plain Node.js.

### Global

```bash
bun install -g github:fm1randa/mdcli
```

### From Source

```bash
gh repo clone fm1randa/mdcli
cd mdcli
bun install
bun dev --help
```

### Optional: 1Password CLI

For automatic login when browser session extraction fails, install the [1Password CLI](https://developer.1password.com/docs/cli/get-started/):

```bash
# macOS
brew install 1password-cli

# Linux
# See https://developer.1password.com/docs/cli/get-started/#install
```

Create a 1Password item with the following fields:
- `username` - your login email
- `password` - your password
- `otp` - one-time password (configured as TOTP)

### Optional: 2Captcha API Key

If the login page shows a reCAPTCHA challenge, you can configure a [2Captcha](https://2captcha.com/) API key to automatically solve it:

```bash
mdcli auth login --captcha-key <your-2captcha-api-key>
```

The API key is saved to config and reused for future logins.

## Authentication

The CLI supports multiple authentication methods:

### Browser Session (Default)

If you're already logged into MeuDinheiro in your browser, the CLI can extract your session automatically:

```bash
# Extracts session from Chrome (default)
mdcli auth login

# Explicitly use Chrome
mdcli auth login --session chrome

# Use Firefox instead
mdcli auth login --session firefox
```

If session extraction fails (e.g., not logged in, browser not found), you'll be prompted with fallback options:
1. Use 1Password for automatic login
2. Try Firefox session instead
3. Open browser for manual login
4. Enter credentials manually
5. Cancel

### 1Password (Automatic)

```bash
# Use 1Password item (prompts for item name on first run)
mdcli auth login --item

# Specify item name directly
mdcli auth login --item "My Meu Dinheiro"
```

### Browser Login (Manual)

Opens a browser for you to log in manually:

```bash
mdcli auth login --browser
```

### Check Status

```bash
mdcli auth status
```

Shows your authentication status including the method used (Browser session, 1Password, etc.).

### Logout

```bash
# Remove the stored session
mdcli auth logout

# Also clear the saved 1Password item and 2Captcha key
mdcli auth logout --all
```

## Usage

```bash
# Authenticate (extracts session from Chrome by default)
mdcli auth login

# Or use 1Password
mdcli auth login --item "My Meu Dinheiro"

# List accounts
mdcli accounts list --active

# Create an alias for quick access
mdcli accounts alias add --id 1167419 --name mp

# List entries using alias
mdcli entries list --account mp --from 2024-01-01 --to 2024-01-31

# Create an entry
mdcli entries create --account mp --description "Groceries" --value 150 --category food

# Update an entry (only the fields you pass are changed)
mdcli entries update 12345 --value 200 --category food

# Delete an entry
mdcli entries delete 12345

# List credit cards
mdcli cards list --active

# Show a credit card invoice (defaults to the current/next one)
mdcli cards invoice --account <cardId> --month 2026-02

# Show upcoming installments on a card
mdcli cards future --account <cardId>
```

## Features

### Auth
| Feature | Status |
|---------|--------|
| Browser session extraction (Chrome/Firefox) | Done |
| Browser login (auto-capture) | Done |
| Automatic login (1Password CLI) | Done |
| Auto token refresh on 401 | Done |
| Manual token entry | Done |
| Status check | Done |
| Logout | Done |

### Accounts
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| Create | Missing |
| Update | Missing |
| Delete | Missing |
| Archive | Missing |

### Categories
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| Filter by type | Missing |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| Create | Missing |
| Update | Missing |
| Delete | Missing |
| Archive | Missing |

### Tags
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| Create | Missing |
| Update | Missing |
| Delete | Missing |
| Archive | Missing |

### Entries
| Feature | Status |
|---------|--------|
| List by account | Done |
| Filter by date range | Done |
| Filter by status | Done |
| Filter by type | Done |
| Filter by category | Done |
| Filter by tag | Done |
| Filter by keywords | Done |
| Filter by value | Done |
| JSON output | Done |
| Alias support (account/category/tag) | Done |
| Create (single) | Done |
| Create (recurring) | Done |
| Update | Done |
| Delete | Done |

### Cards
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Invoice (by month) | Done |
| Future installments | Done |
