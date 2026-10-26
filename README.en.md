<!-- traduzido de README.md @ ddb3364 (base: ddb3364e92800a287a2ce58f2b08b731cfb8af86; readme-blob: e82bc91ad476de37185984df8ad0c73385d043b5); ao atualizar o README.md, sincronize este arquivo e atualize o SHA e o readme-blob (git hash-object README.md) -->

[Português (Brasil)](README.md) · **English**

> The Portuguese [README.md](README.md) is the reference version; this English translation may lag behind it.

# mdcli

Unofficial CLI client for [Meu Dinheiro](https://meudinheiroweb.com.br) - a Brazilian personal finance app.

## Installation

> Requires [Bun](https://bun.sh). mdcli runs TypeScript directly and relies on Bun-only APIs, so it does not run under plain Node.js.

### Global

```bash
bun install -g github:fm1randa/mdcli
```

#### Automatic updates

A global install keeps itself on the latest **release** (a `vYYYY.M.D` tag with a GitHub Release). Commits merged to `main` without a release are not installed.

At most once every 24 hours, mdcli asks GitHub for the latest release (`api.github.com/repos/fm1randa/mdcli/releases/latest`, 1.5 s timeout, no token) and compares it with the installed version (the `package.json` of the install). If the release is newer, it runs `bun install -g github:fm1randa/mdcli#<tag>` in the background; the new version is used from the next run on, which prints one line to stderr, e.g. `mdcli atualizado de 2026.10.13 para 2026.10.20`. stdout is never touched, so `--json` and `--csv` output stays clean.

The check is skipped when running from a source checkout, when `CI` is set, and when offline; a failed check or update never fails the command. The last check time is stored in `update-check.json` inside the config directory (`MDCLI_CONFIG_DIR`, default `~/.config/mdcli`).

To update right away (in the foreground, reporting the result; works even with automatic updates off):

```bash
mdcli update
```

To turn automatic updates off, either set the environment variable:

```bash
export MDCLI_NO_AUTO_UPDATE=1
```

or add `"autoUpdate": false` to `~/.config/mdcli/mdcli.config.json`.

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

The item name is saved and reused on later logins. If you run `mdcli auth login` without `--item` and no item is saved yet, you'll be prompted for the name, with `MeuDinheiroWeb` as the default.

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

# Meu Dinheiro loads entries up to 2031-12-31; a later --to is refused before
# any request. Errors go to stderr with exit code 1; under --json they are
# JSON too ({"error": "..."}), so stdout only ever holds the result.
mdcli entries list --account mp --from 2026-11-01 --to 2031-12-31 --json

# Export entries to CSV (all pages, with account, category, transfer-account and tag names,
# effective/competence dates, repetition, notes and document number;
# date is the planned date, the one --from/--to filter on)
mdcli entries list --account mp --from 2026-01-01 --to 2026-03-31 --csv > entries.csv

# A credit card's purchases, read from its invoices due in the range (the
# statement list leaves card purchases out); dated by the invoice due date,
# with the purchase date as competenceDate
mdcli entries list --account <cardId> --from 2026-10-01 --to 2026-12-31 --json

# Checking account without the card bill projection (type invoice, no ID) the
# API adds for each card it pays; also on summary
mdcli entries list --account mp --from 2026-11-01 --to 2026-11-30 --no-invoices

# Only installments and fixed series (the web app's Repetição filter);
# also on summary. Values: single, installment, fixed
mdcli entries list --account mp --repetition installment,fixed

# Every field of one entry; --json is the list shape, --raw the API answer
mdcli entries show 12345
mdcli entries show 12345 --raw

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

# A card purchase goes to the open invoice (or --invoice YYYY-MM); the ID
# printed is the entry ID from the invoice, usable with update/show/delete
mdcli entries create --account <cardId> --description "Voo" --value 900 --category travel

# Create an entry using the account name instead of an alias
mdcli entries create --account "Mercado Pago" --description "Groceries" --value 150 --category food

# Transfer between two accounts (--account is the origin); the category
# defaults to the system transfer category, as in the web app. Transfers to or
# from a credit card, or between currencies, are not supported yet.
mdcli entries create --account mp --type transfer --to-account nubank --description "Reserva" --value 500

# Installments (parcelada): 1200 split into 10 monthly installments; the first
# one absorbs the rounding cent. --per-installment makes --value each one's,
# --repeat/--frequency set the spacing, --first-installment the starting number.
mdcli entries create --account mp --description "Notebook" --value 1200 --category tech --installments 10

# Fixed series every 2 months, 6 times (--frequency and --times can be combined)
mdcli entries create --account mp --description "Academia" --value 90 --category gym --repeat monthly --frequency 2 --times 6

# Pending (Confirmado off, no effective date yet). The API shows it as pending
# up to today and as scheduled (agendado) for a future date.
mdcli entries create --account mp --description "IPVA" --value 800 --category car --date 2027-01-20 --pending

# Confirmed but not reconciled (without a status flag, create reconciles).
# Credit card purchases are always left unreconciled on the invoice.
mdcli entries create --account mp --description "Feira" --value 30 --category food --confirmed

# Update an entry (only the fields you pass are changed)
mdcli entries update 12345 --value 200 --category food

# Turn a confirmed entry back into a pending one (clears the effective date
# and value); --confirmed confirms it again, --reconciled reconciles it
mdcli entries update 12345 --pending

# Update a transfer from either half of the pair - both halves move together.
# A transfer cannot be turned into an expense or an income.
mdcli entries update 12345 --value 200

# Recurring series (fixed or installments): by default only this occurrence
# changes, and it leaves the series (a warning on stderr says so). A pending or
# scheduled occurrence stays unconfirmed unless you pass --confirmed or --reconciled.
mdcli entries update 12345 --date 2027-01-25 --scope this
# This occurrence and the following ones; earlier ones are left untouched
mdcli entries update 12345 --date 2027-01-25 --scope following

# Change the account (ID, alias, or name, as in create); in a series, with --scope.
# Passing the current account is not an error: the entry is saved as is, as in the web.
# An inactive account is refused (the web does not offer it).
mdcli entries update 12345 --account nubank --scope following
# To a credit card, as in the web: the purchase goes to the invoice of the
# entry's date (or --date) counted from the card's next due date (an earlier
# date lands on the next invoice), without an effective date, on the entry's
# plastic if it belongs to that card, else on the holder's. Off a card, an unreconciled purchase becomes pending on its
# purchase date. Entries on a closed invoice cannot change account (the web
# locks them too).
mdcli entries update 12345 --account <cardId>
# Transfer: --account changes the origin and --to-account the destination; the
# two accounts must differ, and credit cards are not supported yet (so an
# invoice payment, which always involves a card, only changes account in the web app)
mdcli entries update 12345 --to-account reserva

# Delete an entry
mdcli entries delete 12345

# Delete this occurrence of a recurring series and the following ones
# (the web app's "Neste e em todos na sequência"); the default is --scope this
mdcli entries delete 12345 --scope following

# List credit cards (--json has limit, dueDay, nextDueDate, nextClosingDate,
# closingDaysBeforeDue and paymentAccountId; no balance, which means nothing
# for a card). null dueDay/nextDueDate/nextClosingDate: the API has no next due
# date and the CLI counts invoices from primeiraFatura (see docs/cards-json.md)
mdcli cards list --active

# Show a credit card invoice (defaults to the current/next one): the summary the
# web shows (due and closing dates, previous invoice, paid, scheduled payments,
# expenses, income, total, to pay, reconciled/unreconciled, limit, available),
# then the items by purchase date. Lines the API does not send are left out.
mdcli cards invoice --account <cardId> --month 2026-02

# Show a credit card invoice using the card's exact name
mdcli cards invoice --account "Itaú Personalité" --month 2026-02

# In --json (an array of items), date is the invoice due date, the same date
# entries list --json shows for the item; purchaseDate is when it was bought,
# dueDate repeats date and competenceDate comes along
mdcli cards invoice --account <cardId> --month 2026-02 --json

# Only the summary, without the items table
mdcli cards invoice --account <cardId> --month 2026-02 --summary

# Summary and items in one JSON object: { "invoice": {...}, "entries": [...] }.
# invoice has id (closed invoices only), closed, dueDate, closingDate,
# previousInvoice, paid, scheduledPayments, expenses, income, total, toPay,
# reconciled, unreconciled, limit and available. Amounts are R$ with the API's
# signs (reconciled/unreconciled are R$, not counts); a field the API does not
# send is null. entries is the same array --json prints alone.
mdcli cards invoice --account <cardId> --month 2026-02 --json --summary

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
scripts/verify.sh   # full verification: install, typecheck, lint, knip, tests, CLI end-to-end
```

`scripts/verify.sh` is the official check: CI runs it on every pull request and on pushes to `main`, and branch protection requires it to pass before merging. It succeeds when it exits with code 0 and prints `VERIFICAÇÃO OK` as its last line.

While iterating, you can run the individual steps:

```bash
bun run test        # test suite
bun run typecheck
bun run lint
bun run knip        # unused files, dependencies, and exports
```

The tests in `test/` run the real CLI as a subprocess against a local mock of the Meu Dinheiro API (`MDCLI_API_URL` overrides the API base URL), with `HOME` pointed at a temp dir. `MDCLI_CONFIG_DIR` overrides the config directory; `bunfig.toml` preloads `test/setup.ts`, which points it at a temp dir for the whole run, so in-process tests are isolated too. They never touch your real config, browser profiles, or the live API, and they check both what the CLI prints and the exact requests it sends.

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
| Filter by repetition (`--repetition single,installment,fixed`) | Done |
| Leave out card invoice projections (`--no-invoices`) | Done |
| Card purchases in list/summary (read from the invoices) | Done |
| Show one entry (`entries show`, `--json`/`--raw`) | Done |
| Create (single) | Done |
| Create (recurring, `--repeat`/`--frequency`/`--times`) | Done |
| Create installments (`--installments`, `--per-installment`, `--first-installment`) | Done |
| Create transfer (`-T transfer --to-account`) | Done |
| Status on create/update (`-p/--pending`, `--confirmed`, `-r/--reconciled` on update) | Done |
| Credit card purchase on a chosen invoice (`--invoice`) | Done |
| Update | Done |
| Update/delete a series occurrence (`--scope this\|following`) | Done |
| Change the account (`--account`; transfers: `--account`/`--to-account`) | Done |
| Delete | Done |

### Cards
| Feature | Status |
|---------|--------|
| List | Done |
| Filter by active | Done |
| JSON output | Done |
| Invoice (by month) | Done |
| Invoice items with due, purchase and competence dates (`--json`, `date` = due date) | Done |
| Invoice summary (closing, previous invoice, paid, to pay, reconciled, limit, available) | Done (text; `--summary`; `--json --summary`) |
| Card settings in `cards list --json` (limit, due/closing dates, payment account) | Done |
| Future installments | Done |
