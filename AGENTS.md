# Agent Instructions

## Language

- Write everything code-related in American English, such as identifiers and comments.
- Write commits on branches as English conventional commits: `<type>(<scope>): <description>`, with the scope optional, e.g. `docs: clarify release steps`.
- Write the issues and pull requests you open in Brazilian Portuguese, title and body. Start a PR title with its conventional-commit type and optional scope, then a Brazilian Portuguese description, e.g. `fix(cards): corrige a data de vencimento da fatura`. Release PRs use the exact title given in Releases.
- Squash-merge makes the PR title the subject of its commit on `main` (GitHub appends ` (#N)`), so commits merged on `main` under this rule have Brazilian Portuguese descriptions, while earlier ones mix English and Portuguese. This is expected; it does not change how you write branch commits.

## README translation

`README.md` is the reference version, in Brazilian Portuguese; `README.en.md` is its English translation. In any PR that changes `README.md`, update `README.en.md` to match and refresh the comment on its line 1:

- `readme-blob:` the output of `git hash-object README.md` on the final `README.md`. The `readme sync` step of `scripts/verify.sh` fails when it differs from the current `README.md`, so CI rejects a `README.md` change without a synced translation.
- The commit SHA (short after `@`, full after `base:`): the `main` commit the translation was last synced from. In a PR that changes `README.md` itself, keep the `main` commit the branch starts from; the squash-merge SHA is unknown in advance, and the blob already pins the exact content.

## Verification

After completing any request that changes code:

1. Run `scripts/verify.sh`. It is the official verification and the same script the `verify` CI job runs, which branch protection on `main` requires. It runs install, readme sync, typecheck, lint, knip, the test suite, a dependency audit, and an end-to-end run of the real CLI against a local mock API.
2. Treat the run as passing only when it exits 0 and its last line is `VERIFICAÇÃO OK`. A failure ends with `VERIFICAÇÃO FALHOU: <steps>`.
3. Fix everything it reports. To iterate on one step, run it directly (`bun run typecheck`, `bun run lint`, `bun run knip`, `bun run test`), then finish with a full `scripts/verify.sh` run.
4. Introduce no new warnings.

## Tests

Do not write tautological tests: a test that only re-asserts a mock or stub, re-implements the code under test, asserts constants or types, or cannot fail when the behavior breaks.

## Versioning

- Use CalVer `YYYY.M.D` without leading zeros (e.g. `2026.10.13`), which is valid semver for npm.
- `version` in `package.json` is the single source of truth (`--version` and `scripts/verify.sh` read it). Bump it only when making a release.
- For a second release on the same day, use `YYYY.M.D-N` with N starting at 2 (e.g. `2026.10.13-2`). Semver treats this as a pre-release that sorts *before* `2026.10.13`, so use it only when necessary and prefer the next day's date when possible.

## Releases

A Release is what reaches users: global installs self-update only to the latest GitHub Release, never to the tip of `main` (see `docs/adr/0002-self-update-from-tagged-releases.md`).

The maintainer bot releases at the end of every day that merged a `feat` or `fix` (a change users can see). Days with only `test`, `docs`, `refactor` or `chore` merges get no release. Filipe can request a release at any time.

1. Open a PR `chore(release): vYYYY.M.D` that sets `version` in `package.json` to the date (see Versioning). Squash-merge it once `scripts/verify.sh` and the `verify` check pass.
2. Create the annotated tag `vYYYY.M.D` on the merge commit in `main` and push it. The tag must equal `v` + the `version` in `package.json` at that commit.
3. Publish the GitHub Release for that tag, titled `vYYYY.M.D`: not a draft, not a prerelease, marked as latest.
4. Write the release notes in Brazilian Portuguese: a summary of the user-visible changes since the previous release, taken from the maintainer's changelog (`/workspace/mdcli-team/changelog.md`, on the maintainer bot's machine, outside this repo), ending with the list of links to the included PRs.
5. Record the release in that `changelog.md`.

Never move or delete a published tag. To correct a release, make a new one.
