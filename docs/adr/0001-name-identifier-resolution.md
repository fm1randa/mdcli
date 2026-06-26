# 0001: Name-based identifier resolution with persistent on-disk cache

Users can pass a real Account, Category, or Tag name (the API's `nome` field) to `--account`, `--category`, or `--tag` in addition to numeric IDs and user-defined Aliases. Resolving a name requires the full entity list, so we cache the `nome → id` maps in `~/.config/mdcli/mdcli.config.json` with a 30-day TTL, and auto-invalidate the cache the first time a request that used a cached mapping returns a non-2xx.

**Considered Options**

- *Hit the API on every CLI invocation* — rejected: doubles the latency of every name-using command and adds a dependency on a live API for what is effectively a static lookup. Aliases already prove the value of an offline fast path.
- *In-memory cache only* — rejected: a CLI invocation is short-lived; a cache that doesn't survive `mdcli` exit is just a slower API call.
- *Short TTL (1h)* — rejected: Account/Category/Tag names change on the order of months or years, not hours. A short TTL just pays the same API cost as no cache.
- *No name resolution at all* — rejected: forces the user to look up the numeric ID from `mdcli accounts list` and remember it, which defeats the purpose of having a CLI for quick terminal-driven use.
- *Fuzzy / prefix matching on names* — rejected during grilling: increases the chance of accidental matches across similarly-named accounts and complicates the error UX. Aliases already cover the "I want to type a short prefix" use case.

**Consequences**

- `resolveId` and `resolveIds` in `src/lib/aliases.ts` gain a third fallback step. Existing callers are unchanged.
- The Name cache adds three new optional fields to `MdcliConfig` (`nameCache.accounts`, `nameCache.categories`, `nameCache.tags`, plus a `cachedAt` timestamp per type).
- Any command that resolves a name pays at most one API call per entity type per 30 days. Aliases and numeric IDs cost nothing.
- The auto-invalidation is best-effort: it only fires when a request that actually used a cached mapping fails. A user who renames an entity and then runs an Alias-only or ID-only command will not trigger invalidation until a name-using command fails.
