# mdcli

CLI client for [Meu Dinheiro](https://meudinheiroweb.com.br), a Brazilian personal finance app. This glossary covers the terms that show up in user-facing commands and how user-supplied identifiers are resolved to API IDs.

## Language

**Account**:
A financial account held at Meu Dinheiro (checking, savings, credit card, investment, etc.).
_Avoid_: "conta" (Portuguese only — keep the surface in English)

**Category**:
A classification for an entry — expense, income, or transfer. A Category can be inactive (`status: false`): the web app hides it from the entry form, so `entries create`/`update` refuse it too. When a name matches both an active and an inactive Category, the active one wins; an explicit ID or Alias pointing at an inactive one is refused. Filters (`entries list -c`) still accept inactive Categories, since old Entries keep them.
_Avoid_: "cat" (only in short CLI flags, never in prose)

**Tag**:
A free-form label that can be attached to an entry.

**Entry**:
A single financial transaction (lancamento). Has an account, a category, optional tags, a value, and a date.
_Avoid_: "transaction", "record"

**Status**:
Where an Entry stands. The web app's entry form has two toggles, Confirmado and Conciliado, so an Entry can be set to three states: **Pending** (Confirmado off: no effective date or value), **Confirmed** (Confirmado on, Conciliado off) and **Reconciled** (both on). The API reports Pending as `pendente` while the planned date is today or earlier and as `agendado` (**Scheduled**) once it is in the future - same payload, the date decides (md.js, the toast after saving: Conciliado / Confirmado / Agendado / Pendente). On `entries create`/`update`: `-p, --pending` = Pending (Scheduled when the date is in the future), `--confirmed` = Confirmed, `-r, --reconciled` (update) = Reconciled; `create` without a flag reconciles. `--scheduled` is a hidden alias of `--pending`. Credit card purchases only have Conciliado (`nconciliado` until the invoice is paid, which the web app shows as Confirmado): the CLI never reconciles them and ignores `-p`/`--confirmed` with a warning on stderr. A label the CLI does not know is shown as **Unknown** (`status: "unknown"` in `--json`), never guessed; `entries show --raw` has the API's label.
_Avoid_: "pending" for a confirmed, unreconciled Entry (that is Confirmed - the mistake behind the 2026-10-19 bug)

**Invoice**:
A credit card bill (fatura), fetched by its due date (`GET /v1/cartoes/:id/fatura/:dueDate`). Each item has three dates: the **due date** (`dataPrevista`, or the invoice's `vencimento`), which `cards invoice --json` and `entries list --json` both report as `date` (the invoice also repeats it as `dueDate`); the **purchase date** (`data`, `purchaseDate` in `--json`, the Purchase column of the table), a year earlier for an installment 12/18; and the competence date (`dataCompetencia`). The invoice's **summary** comes from `resumo` (names from md.js): due and closing dates (`vencimento`, `fechamento`), Previous invoice (`valorFaturaAnterior`), Paid (`pagamentosConf`), Scheduled payments (`pagamentosAgen`), Expenses/Income (`despesas`/`receitas`), Invoice total (`totalFatura`, falling back to `valor`), To pay (`totalPagar`), Reconciled/Unreconciled (`conciliado`/`nconciliado`) and Available (`disponivel`); Limit is the card's `limite`, as in the web. A field the API leaves out is not shown. The summary is text-only for now: `--json` stays an array of items.
_Avoid_: "balance" for a card (`cards list --json` has none: `saldoUltimoExtrato` is an Open Finance figure, not what is owed)

**Series**:
A recurring Entry rule (agenda). Occurrences carry `agendaId` and `parcela` (e.g. `fixa`, `2/6`). On update/delete, `--scope this` (default) touches only the current occurrence; `--scope following` touches this one and the ones after it. Both map to the API flag `todos` (`false` / `true`). The web labels are "Apenas neste" / "Neste e em todos na sequência". There is no `--scope all` — the web only exposes that boolean.
_Avoid_: "recurrence" alone (prefer Series when talking about `--scope`)

**Connection**:
A link between a bank and Meu Dinheiro through the web app's bank integration (Integração bancária). A Connection has zero or more Accounts (Banco do Brasil and Ourocard can share one). Each bank-side account is a connection account, optionally linked to an Account. **Sync** asks the bank for new data through the Connection (the web's "Atualizar conexão"), at most 3 times a day per connector.
_Avoid_: "integration" for a single link (the integration is the feature; a Connection is one bank link)

**Bank Transaction**:
A movement the bank reported through a Connection that may not be an Entry yet. It has the bank's identifier, a description, a value and a date, but no Entry ID and no Status.
_Avoid_: "transaction" alone, "entry" (an Entry is what exists in Meu Dinheiro)

**Import**:
Turning selected Bank Transactions into Entries, each with a Category. As in the web app, an Import is all or nothing: it runs only when every selected Bank Transaction has a Category. A Bank Transaction that matches an existing Entry (same Account and value, date within 2 days) already exists and is not imported again: as in the web, it is linked to at most one such Entry, and each Entry to at most one Bank Transaction. By default the Import offers the new Bank Transactions the Connection reports (its summary, the web's import badge); a Connection read without a Sync rarely has one, and then the Import loads the statement like the web's import button: everything since the Account's last statement date (`dataUltimoExtrato`), or 90 days ago if that is earlier or missing, already imported or not. `--since` loads everything since another date. The web calls this screen "Conciliação bancária", but importing is not the Reconciled Status: an imported Entry dated today or earlier simply starts as Reconciled.
_Avoid_: "conciliação", "reconcile" for the act of importing (Reconciled is a Status)

**Alias**:
A user-defined short string mapped to exactly one Account, Category, or Tag ID. Stored locally in `~/.config/mdcli/mdcli.config.json`. Aliases are offline — no API call needed to resolve them.
_Avoid_: "shortcut", "nickname"

**Identifier**:
The value a user passes to `--account`, `--category`, or `--tag`. It can be a numeric ID, an Alias, or the entity's real name (e.g. the Account's `nome` from the API). All three are accepted on the same flag; the resolver decides which.
_Avoid_: "input", "argument" (too generic)

**Name cache**:
A persistent on-disk map of `nome → id` for Accounts, Categories, and Tags. Lives alongside Aliases in the same config file. The cache exists so that resolving an Identifier by name does not require an API call on every CLI invocation.

**Release**:
A published version of mdcli: a CalVer version (e.g. `2026.10.13`) marked by a git tag `v2026.10.13` and a GitHub Release with notes. Only a Release reaches users; commits merged to `main` without a Release do not.
_Avoid_: "deploy", "build", "latest commit"

**Self-update**:
A global install replacing itself with the newest Release, without the user asking. Can be turned off by the user and never interrupts the command being run; `mdcli update` does the same on demand.
_Avoid_: "auto-upgrade", "sync with main"

## Relationships

- An **Account** is the holder of one or many **Entries**
- A **Category** classifies one or many **Entries**
- A **Tag** may be attached to zero or many **Entries**
- An **Alias** points to exactly one **Account**, **Category**, or **Tag**
- A **Series** groups one or many **Entry** occurrences under one agenda rule
- An **Identifier** resolves (via the resolver pipeline) to exactly one numeric ID, which is then used in the API call

## Resolver pipeline

The order in which an **Identifier** is resolved is fixed and intentional:

1. **Numeric** — if the string is a positive integer in plain digits (`1167419`; not `''`, `0`, `1e3` or `0x10`), treat it as the API ID directly. Fastest, fully offline, no ambiguity. Anything else falls through to the next steps.
2. **Alias** — look up the string in the local Alias map for the relevant entity type. Still offline.
3. **Name** — if a non-numeric string matches no Alias, fetch the entity list from the API (or read the Name cache) and do a case-insensitive exact match against the `nome` field. This step is the only one that may hit the network.

Aliases intentionally win over names so that short user-chosen shortcuts are never silently overridden by a real Account/Category/Tag name.

## Example dialogue

> **Dev:** "If a user types `--account 1167419`, does that hit the network?"
> **Domain expert:** "No — numeric Identifiers are taken at face value as the API ID. No Alias lookup, no Name cache."
>
> **Dev:** "What if they type `--account mp` and they have an Alias `mp` for account `1167419` but also own a real account named 'mp'?"
> **Domain expert:** "The Alias wins. The user can rename or remove the Alias to fall through to name resolution."
>
> **Dev:** "What if they rename an account in the Meu Dinheiro web UI and the cached name still points to the old ID?"
> **Domain expert:** "The Name cache is auto-invalidated the next time a request that used a cached mapping returns a non-2xx. The user doesn't need to run any manual refresh."

## Flagged ambiguities

- "Account" was at risk of being confused with the user's bank login — resolved: here it always means a financial account within Meu Dinheiro, never the user's authentication context.
- "Update" can mean `mdcli <entity> update` (editing an Account, Category, Tag, or Entry) or Self-update — resolved: Self-update is always named as such; the top-level `mdcli update` is the only command that refers to it.
- "ID" can mean the numeric API ID, an Alias, or a name — resolved: the term **Identifier** covers all three; **ID** (bare) always means the numeric API ID.
