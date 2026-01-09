# mdcli

Unofficial CLI client for [Meu Dinheiro](https://meudinheiroweb.com.br) - a Brazilian personal finance app.

## Installation

### Global (npm/bun)

```bash
bun install -g github:fm1randa/mdcli
# or
npm install -g github:fm1randa/mdcli
```

### From Source

```bash
gh repo clone fm1randa/mdcli
cd mdcli
bun install
bun dev --help
```

### Optional: 1Password CLI

For automatic login with automatic token refresh, install the [1Password CLI](https://developer.1password.com/docs/cli/get-started/):

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

## Usage

```bash
# Authenticate using 1Password (default, prompts for item name on first run)
mdcli auth login

# Specify 1Password item name (saved to config for future use)
mdcli auth login --item "My Meu Dinheiro"

# Or open browser for manual login
mdcli auth login --browser

# List accounts
mdcli accounts list --active

# Create an alias for quick access
mdcli accounts alias add --id 1167419 --name mp

# List entries using alias
mdcli entries list --account mp --from 2024-01-01 --to 2024-01-31

# Create an entry
mdcli entries create --account mp --description "Groceries" --value 150 --category food
```

## Features

### Auth
| Feature | Status |
|---------|--------|
| Browser login (auto-capture) | Done |
| Automatic login (1Password CLI) | Done |
| Auto token refresh on 401 | Done |
| Manual token entry | Done |
| Status check | Done |
| Logout | Missing |

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
| Update | Missing |
| Delete | Missing |
| Reconcile | Missing |
| Confirm | Missing |
