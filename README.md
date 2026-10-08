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

The API authenticates each request with two headers, `Mdapikey` and `Mduid`, plus a bearer token when one is available. Every login method below ends up saving these values to `~/.config/mdcli/mdcli.config.json`.

### Default flow

```bash
mdcli auth login
```

Without flags, the CLI first tries the method that worked last time (a Chrome session on first run). If that fails and you're in an interactive terminal, it offers the other methods. Outside a terminal (scripts, CI) it exits with an error listing the explicit flags instead of waiting for input.

### Browser session

If you're already logged into Meu Dinheiro in a browser, the CLI can reuse that session:

```bash
mdcli auth login --session chrome
mdcli auth login --session edge
mdcli auth login --session firefox
```

On macOS, reading a browser profile requires **Full Disk Access** for the terminal app you run `mdcli` from (System Settings → Privacy & Security → Full Disk Access). Restart the terminal after enabling it.

### Manual entry

Copy the headers from your browser's DevTools: open the **Network** tab, pick any request to `/api/`, and look under **Request Headers**.

```bash
mdcli auth login --manual
```

You'll be asked for `Mdapikey`, `Mduid`, and the bearer token (the `Authorization` value without `Bearer `). This method doesn't automate a browser, so it works even where the others are blocked.

### 1Password

```bash
mdcli auth login --item "My Meu Dinheiro"
```

The item name is saved and reused on later logins.

### Browser login

Opens Chrome or Edge (whichever is installed) so you can log in by hand:

```bash
mdcli auth login --browser
```

The login page is protected by Cloudflare, which may reject logins from an automated browser. If you see "Falha na verificação", use `--session` or `--manual` instead.

### Troubleshooting

```bash
mdcli auth doctor
```

Checks whether the Chrome, Edge, and Firefox profiles are present and readable, whether the 1Password CLI is installed, and whether you're currently authenticated.

When the API rejects the saved credentials, the CLI retries with the method you last logged in with. For manual and browser logins it asks you to run `mdcli auth login` again.

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

### Identifying accounts, categories, and tags

`--account`, `--category`, and `--tag` accept three forms, tried in this order:

1. **Numeric ID** — e.g. `--account 1167419`. Fastest, no network needed.
2. **Alias** — a short name you've mapped to an ID via `mdcli accounts alias add`. Stored locally in `~/.config/mdcli/mdcli.config.json`.
3. **Exact name** — the entity's real name as shown by `mdcli accounts list`, matched case-insensitively. Names are looked up via a 30-day on-disk cache and auto-invalidated when a request using a cached ID returns a non-2xx.

Aliases win over names when both match the same string, so your shortcuts always take priority.

```bash
# Authenticate (extracts session from Chrome by default)
mdcli auth login

# Or use 1Password
mdcli auth login --item "My Meu Dinheiro"

# List accounts
mdcli accounts list --active

# List the account types accepted by --type
mdcli accounts types

# Create an account (--type accepts the ID or the name from "accounts types")
mdcli accounts create --name "Nubank" --type "Conta Corrente" --bank nubank --balance 0

# Update an account (only the fields you pass are changed)
mdcli accounts update 1167419 --name "Nubank PF"

# Archive (deactivate) or reactivate an account
mdcli accounts update 1167419 --inactive
mdcli accounts update 1167419 --active

# Delete an account (asks for confirmation)
mdcli accounts delete 1167419

# Create an alias for quick access
mdcli accounts alias add --id 1167419 --name mp

# List entries using alias
mdcli entries list --account mp --from 2024-01-01 --to 2024-01-31

# List entries using the account's exact name (case-insensitive)
mdcli entries list --account "Nubank - Conta Corrente" --from 2024-01-01 --to 2024-01-31

# Export entries to CSV (all pages, with account and category names)
mdcli entries list --account mp --from 2026-01-01 --to 2026-03-31 --csv > entries.csv

# Income vs. expenses by category for the current month (transfers left out)
mdcli entries summary --account mp,nubank

# Month by month for a quarter, or per account; --json/--csv also work here
mdcli entries summary --account mp --from 2026-01-01 --to 2026-03-31 --by month
mdcli entries summary --account mp,nubank --by account --include-transfers

# Leave out categories (and their subcategories), e.g. a card bill paid from
# checking that would double-count the purchases already on the card
mdcli entries summary --account mp,nubank --exclude-category "Pagamento de cartão"

# Create an entry
mdcli entries create --account mp --description "Groceries" --value 150 --category food

# Create an entry using the account name instead of an alias
mdcli entries create --account "Mercado Pago" --description "Groceries" --value 150 --category food

# Update an entry (only the fields you pass are changed)
mdcli entries update 12345 --value 200 --category food

# Update a transfer from either half of the pair - both halves move together.
# A transfer cannot be turned into an expense or an income.
mdcli entries update 12345 --value 200

# Delete an entry
mdcli entries delete 12345

# List credit cards
mdcli cards list --active

# Show a credit card invoice (defaults to the current/next one)
mdcli cards invoice --account <cardId> --month 2026-02

# Show a credit card invoice using the card's exact name
mdcli cards invoice --account "Itaú Personalité" --month 2026-02

# Show upcoming installments on a card
mdcli cards future --account <cardId>

# List only expense categories
mdcli categories list --type expense

# Create a category, then a subcategory (inherits the parent's type)
mdcli categories create --name "Pets" --type expense
mdcli categories create --name "Vet" --parent "Pets"

# Rename, archive, or reactivate a category
mdcli categories update 12345 --name "Pet care"
mdcli categories update 12345 --inactive

# Delete a category; its entries move to --move-to (must be the same type).
# Categories with subcategories must have those removed first.
mdcli categories delete 12345 --move-to "Outros"

# Create a tag (color is optional, defaults to gray)
mdcli tags create --name "Travel" --color "#FF6600"

# Update a tag (only the fields you pass are changed)
mdcli tags update 12345 --color "#00AAFF"

# Archive (deactivate) or reactivate a tag
mdcli tags update 12345 --inactive
mdcli tags update 12345 --active

# Delete a tag
mdcli tags delete 12345
```

## Development

```bash
bun run test        # test suite
bun run typecheck
bun run lint
bun run knip        # unused files, dependencies, and exports
```

The tests in `test/` run the real CLI as a subprocess against a local mock of the Meu Dinheiro API (`MDCLI_API_URL` overrides the API base URL), with `HOME` pointed at a temp dir. They never touch your real config, browser profiles, or the live API, and they check both what the CLI prints and the exact requests it sends.

## Features

### Auth
| Feature | Status |
|---------|--------|
| Browser session extraction (Chrome/Edge/Firefox) | Done |
| Browser login (auto-capture) | Done |
| Automatic login (1Password CLI) | Done |
| Remember last login method | Done |
| Auto refresh on 401 (using the last method) | Done |
| Manual token entry | Done |
| Status check | Done |
| Diagnostics (`auth doctor`) | Done |
| Logout | Done |

### Accounts
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| List types | Done |
| Create | Done |
| Update | Done |
| Delete | Done |
| Archive | Done |

### Categories
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| Filter by type | Done |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| Create (incl. subcategories) | Done |
| Update | Done |
| Delete (moves entries to another category) | Done |
| Archive | Done |

### Tags
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Aliases (add/list/rm/update) | Done |
| Create | Done |
| Update | Done |
| Delete | Done |
| Archive | Done |

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
| CSV export | Done |
| All pages (no 200-entry cap) | Done |
| Summary by category/month/account | Done |
| Exclude categories (`--exclude-category`) | Done |
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
