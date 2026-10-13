# 0002: Self-update from tagged GitHub Releases, not the tip of main

Global installs (`bun install -g github:fm1randa/mdcli`) Self-update. The trigger is a new Release — a git tag `vYYYY.M.D` matching the CalVer `version` in `package.json`, published as a GitHub Release — and the updater installs exactly that tag (`github:fm1randa/mdcli#vYYYY.M.D`). The installed version is read from the installed `package.json`; the latest is the tag of `releases/latest`. A first implementation (#44) compared the installed commit with the tip of `main` instead; this decision replaces it.

**Considered Options**

- *Tip of `main`* — rejected: `main` receives several autonomous merges a day (refactors, tests, docs). Shipping every one of them to users makes each merge a release with no notes, no deliberate cut, and no stable version to report; `--version` would print the same CalVer for many different builds.
- *`version` in `main`'s `package.json`, installing `main`* — rejected: reading the version is cheap, but `bun install -g github:...` without a ref installs the tip of `main`, which may already contain unreleased commits. The installed code would not be the released code.
- *npm registry* — rejected: the project is installed straight from GitHub and is not published to npm; adding a registry adds credentials and a second source of truth.
- *Tags without GitHub Releases* — rejected: `releases/latest` is a single unauthenticated call that skips drafts and prereleases, and the Release carries the pt-BR notes users read.

**Consequences**

- Merging to `main` no longer reaches users; someone has to cut a Release. The maintainer bot does it at the end of each day with `feat`/`fix` merges, or on request (procedure in `AGENTS.md`).
- A tag must equal `v` + the `package.json` version of its commit, or the updater would keep reinstalling. Published tags are never moved.
- Until the first Release exists, `releases/latest` returns 404 and Self-update is a silent no-op.
- Installs made by #44's main-tracking updater carry their commit's `package.json` version and move to the next Release that is newer than it.
