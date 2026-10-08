# mdcli

CLI client for [Meu Dinheiro](https://meudinheiroweb.com.br), a Brazilian personal finance app. This glossary covers the terms that show up in user-facing commands and how user-supplied identifiers are resolved to API IDs.

## Language

**Account**:
A financial account held at Meu Dinheiro (checking, savings, credit card, investment, etc.).
_Avoid_: "conta" (Portuguese only — keep the surface in English)

**Category**:
A classification for an entry — expense, income, or transfer.
_Avoid_: "cat" (only in short CLI flags, never in prose)

**Tag**:
A free-form label that can be attached to an entry.

**Entry**:
A single financial transaction (lancamento). Has an account, a category, optional tags, a value, and a date.
_Avoid_: "transaction", "record"

**Alias**:
A user-defined short string mapped to exactly one Account, Category, or Tag ID. Stored locally in `~/.config/mdcli/mdcli.config.json`. Aliases are offline — no API call needed to resolve them.
_Avoid_: "shortcut", "nickname"

**Identifier**:
The value a user passes to `--account`, `--category`, or `--tag`. It can be a numeric ID, an Alias, or the entity's real name (e.g. the Account's `nome` from the API). All three are accepted on the same flag; the resolver decides which.
_Avoid_: "input", "argument" (too generic)

**Name cache**:
A persistent on-disk map of `nome → id` for Accounts, Categories, and Tags. Lives alongside Aliases in the same config file. The cache exists so that resolving an Identifier by name does not require an API call on every CLI invocation.

## Relationships

- An **Account** is the holder of one or many **Entries**
- A **Category** classifies one or many **Entries**
- A **Tag** may be attached to zero or many **Entries**
- An **Alias** points to exactly one **Account**, **Category**, or **Tag**
- An **Identifier** resolves (via the resolver pipeline) to exactly one numeric ID, which is then used in the API call

## Resolver pipeline

The order in which an **Identifier** is resolved is fixed and intentional:

1. **Numeric** — if the string parses as a non-negative integer, treat it as the API ID directly. Fastest, fully offline, no ambiguity.
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
- "ID" can mean the numeric API ID, an Alias, or a name — resolved: the term **Identifier** covers all three; **ID** (bare) always means the numeric API ID.
