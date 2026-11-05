# Agent Instructions

## Language

- Write everything code-related in American English, such as identifiers and comments.
- Write commits on branches as English conventional commits: `<type>(<scope>): <description>`, with the scope optional, e.g. `docs: clarify release steps`.
- Write issues and pull requests in Brazilian Portuguese: titles, bodies, and your comments and reviews on them. Start a PR title with its conventional-commit type and optional scope, then a Brazilian Portuguese description, e.g. `fix(cards): corrige a data de vencimento da fatura`. Release PRs use the exact PR title given in Releases.
- Squash-merge puts the PR title in the `main` commit subject; a one-commit PR uses its only commit's subject instead. GitHub appends ` (#N)` either way. Main's history therefore mixes Brazilian Portuguese and English; release commits, commits from bot PRs such as Dependabot's, and commits from before this convention are exempt from these language rules. This is expected; it does not change how you write branch commits.

## README translation

`README.md` is the reference version, in Brazilian Portuguese; `README.en.md` is its English translation. In any PR that changes `README.md`, update `README.en.md` in the same PR to match and update the `readme-blob:` hash in its line-1 comment:

- `readme-blob:` the output of `git hash-object README.md` on the final `README.md`. The `readme sync` step of `scripts/verify.sh` fails when the recorded `readme-blob:` does not match the current `README.md`, so CI rejects a `README.md` change without a synced translation.
- The commit SHA (short after `@`, full after `base:`): the `main` commit the translation was last synced from. In a PR that changes `README.md` itself, keep the `main` commit the branch starts from; the squash-merge SHA is unknown in advance, and the blob already pins the exact content.

## Verification

After completing any request that changes code:

1. Run `scripts/verify.sh`. It is the official verification and the same script the `verify` CI job runs, which branch protection on `main` requires. It runs install, readme sync, typecheck, lint, knip, the test suite, a dependency audit, a check that no `REVIEW-*.md` is tracked, a check that no commit message in `<base>..HEAD` or PR body carries a guarded private term, a check that every `eslint-disable` the diff adds says why after `--`, and an end-to-end run of the real CLI against a local mock API.
2. Treat the run as passing only when it exits 0 and its last line is `VERIFICAÇÃO OK`. A failure ends with `VERIFICAÇÃO FALHOU: <steps>`.
3. Fix everything it reports. To iterate on one step, run it directly (`bun run typecheck`, `bun run lint`, `bun run knip`, `bun run test`), then finish with a full `scripts/verify.sh` run.
4. Introduce no new warnings.

## Rule coverage

Each rule below names the check that fails when it breaks. A rule marked *text only* is enforced by review; add a check here when one becomes cheap. The table starts with the error classes that already repeated in this repository, plus the review-note guard.

| Rule | Check | Where |
| --- | --- | --- |
| `README.en.md` translates the current `README.md` | `readme sync` step (CI `verify`) | `scripts/verify.sh` |
| Both i18n catalogs carry the same keys | `catalog-keys` test | `test/catalog-keys.test.ts` |
| Files stay small | `max-lines` (300) | `eslint.config.js` |
| The suite gives the same result on any terminal | environment normalization, guard test, and a hostile `TERM` in CI | `test/setup.ts`, `test/terminal-env.test.ts`, `.github/workflows/ci.yml` |
| Tests pass a relative `--since` and read a pinned clock | `no-literal-since`, `no-ambient-clock`, restricted date imports; `TZ` and `MDCLI_TODAY` pinned | `eslint-rules/`, `eslint.config.js`, `test/setup.ts` |
| Strings become numbers only through the strict helpers | `no-loose-number` | `eslint-rules/no-loose-number.js` |
| A category name resolves through its single owner (active wins, ambiguous and inactive refused) | `no-category-name-resolution` | `eslint-rules/no-category-name-resolution.js` |
| Review notes never reach a commit (item 19) | `git ls-files 'REVIEW-*.md'` must be empty | `scripts/verify.sh`, `.gitignore` |
| The private-data guard covers commit messages and the PR body, not only the tracked tree | `private messages` step (CI `verify`, rerun on a PR body edit) | `scripts/check-private-messages.ts`, `scripts/verify.sh`, `.github/workflows/ci.yml` |
| An `eslint-disable` is a described exception, never a copied pattern | `disable-directive-description`, unused-directive reporting, and the `eslint disables` step (CI `verify`) | `eslint-rules/`, `eslint.config.js`, `scripts/check-eslint-disables.ts`, `scripts/verify.sh` |
| The mock answers with the API's response types, not what the CLI happens to read | `typecheck` (`tsc --noEmit`): every fixture and `scripts/mock-*.ts` payload carries its `src/types` response type | `test/fixtures.ts`, `scripts/mock-*.ts` |
| Tests assert behavior, not a mock or a constant (item 12) | `no-tautological-expect` (literal vs itself, assertions over src/bin text) and the `fails-on-main` CI job (in a PR that changes `src/` or `bin/`, every new or changed test must fail against `origin/main`) | `eslint-rules/no-tautological-expect.js`, `.github/workflows/fails-on-main.yml`, `scripts/new-tests-fail-on-main.ts` |
| A "no hits" assertion is paired with a positive control against the same production constant | *text only* | review |
| The private-data guard is derived from the whole pre-change corpus, not from the terms a review noticed | *text only* | review |
| Security surfaces (the private-data guard, its test, the message guard, its test, `scripts/verify.sh`, `eslint-rules/`) enter the risky set | `security surfaces` tests | `test/risk.test.ts`, `test/risk-label.test.ts` |
| The CLI follows the web app, and a conflict with Filipe's decision is reported (items 9 and 10) | `prova` (`scripts/prova.ts`) requires, for a PR that changes `src/`, a `Web:` line with the bundle snippet or `sem equivalente na web`; a conflict with Filipe's decision stays *text only* (review) | `scripts/prova.ts`, `.github/workflows/prova.yml` |

## Merge by proof

Every PR that changes `src/` fills the **Prova** section of the PR template. It shows the CLI commands run against the mock (`scripts/mock-api.ts`, fake config in `/tmp`), never against a real account, on `main` (before) and on the branch (after), with their outputs, proving the behavior the issue asks for. The `prova` CI check reads the PR body and fails when the section, the `Web:` line or one of the two blocks is missing; it runs on `opened`, `synchronize`, `reopened` and `edited`. The `Web:` line carries a snippet from the web bundle (`$HOME/.mdcli-team/ref/mdb.js`) that shows the behavior, or `sem equivalente na web`. Paraphrasing the web inside the proof without that line no longer counts.

`bun scripts/risk.ts` classifies the diff against `origin/main` and prints `{ "risky": bool, "reasons": [...] }`; it exits 2 when the PR touches authentication, session or credentials, data writes (create, update, delete, `entries import run`, or any POST/PUT/DELETE call to the API), or a security surface: `scripts/private-terms.ts`, `test/private-terms.test.ts`, `scripts/check-private-messages.ts`, `test/check-private-messages.test.ts`, `scripts/verify.sh`, or anything under `eslint-rules/`. A comment-only change in a security surface stays safe. A risky PR:

- runs `/blast-radius` and proves the security fact in a test or in `scripts/verify.sh`;
- waits for the maintainer's decision before merge.

The `risco` label mirrors that classification in the PR list. `.github/workflows/risco.yml` runs `scripts/risk.ts` on `opened`, `synchronize`, `reopened` and `edited`, then `scripts/risk-label.ts` adds the label when the PR is risky and removes it when a push leaves the PR safe. The job writes the reasons to its summary, and a PR from a fork only gets the summary: its read-only token cannot change labels, so the job does not fail over the label. The workflow declares only `contents: read` and `pull-requests: write`; creating a repository label needs `issues: write`, so the label is created once and kept in sync by the workflow. Create it (or restore it after deletion) with:

```sh
gh label create risco --force --color B60205 --description "PR arriscado: exige /blast-radius e decisão do mantenedor"
```

A PR labeled `risco` follows the two rules above.

`/code-review` is no longer the default merge path; use it for a targeted review when the proof or the risk analysis does not cover a change. After a session with three or more review rounds, or one that got stuck, run `/reflect` (read-only); its proposals land only with the maintainer's approval.

## Tests

Do not write tautological tests: a test is tautological when it only re-asserts a mock or stub, re-implements the code under test, asserts constants or types, or cannot fail when the behavior breaks. The `fails-on-main` CI job runs every new or changed test in a PR that changes `src/` or `bin/` against `origin/main` and fails when it passes there.

A test that asserts a collection is empty passes just as well when the collection or its matcher is broken. Pair every "no hits" assertion with a positive control against the same production constant and a literal expected value, as `test/private-terms.test.ts` does for the guard.

## Private data

Never put real account data in the repository: no real account, card, entry, category, tag or plastic name, id or value, and no personal agent name. Use obviously synthetic values, such as "Conta Teste", "Cartão Teste" and small ids. This applies to code, fixtures, docs, issues, PR bodies and commit messages. `test/private-terms.test.ts` fails when a hash of a known term appears in any versioned file.

Derive the guard from the whole pre-change corpus, not from the terms a review happened to notice. Before the sweep, enumerate every candidate from the base commit and from the deletions of `git diff origin/main...HEAD`, and add a hash for all of them. A guard built one review finding at a time is incomplete by construction.

Identify a value semantically, not by one literal spelling. When you add a term, add every alias, every component of the record (a total and its breakdown), every locale number spelling (plain, thousands, comma or dot decimal), escaped separators as they appear in a regex, ids split by the tokenizer, and ids with a date variant. The guard also covers the public surface outside the tracked files: `scripts/check-private-messages.ts` (the `private messages` step of `scripts/verify.sh`) scans `git log <base>..HEAD --format=%B` and the PR body, because a squash-merge copies the PR body into the commit and a pushed commit message only changes with a force-push.

A short numeric id has low entropy: an unsalted hash publishes a brute-forceable fingerprint of the value it hides. Do not add a low-entropy term as an unsalted hash; use a keyed hash whose key stays outside the repository, or do not store it.

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

## Agent sessions

An agent session prompt is a short intention followed by the skill call at the end (e.g. `fix bug #321 /poteto-mode` or `revisar PR #123 /poteto-mode`). Never start a prompt with `/poteto-mode` or any other `/` command: T3 sends a leading slash to opencode as a command, which dies at T3's hardcoded 300 s timeout. The task details live in the issue or PR; the rules below are permanent.

### Environment and verification

1. Before anything else, run `bun install --frozen-lockfile`.
2. Use the Bun version pinned in `package.json` (`packageManager`, currently `bun@1.4.2`): check `bun --version` before any gate. If it diverges, stop and say that in the result instead of continuing with a different version. Do not change `bun.lock` or `package.json` versions (except a release bump).
3. Run `scripts/verify.sh` directly (not via `bun run`), without `TERM`, `COLORTERM` and `TERM_PROGRAM` in the environment, for example `env -u TERM -u COLORTERM -u TERM_PROGRAM scripts/verify.sh`. Run it in the foreground, with a tool timeout of at least 20 minutes, without giving up earlier. If it hangs, discover which step and which test hung and report it.

### Limits (what the session never does)

4. Never merge, release, tag, force-push, or push to `main`; the release flow in Releases belongs to the maintainer, not to a session. Non-force push only to the PR's own branch (`git push -u origin HEAD:<branch>`).
5. Never touch secrets or credentials; never read or print values of `MDCLI_WEBHOOK_*`.
6. Never use the real Meu Dinheiro account or real data, and never send real PUT/POST. Only use the mock (`scripts/mock-api.ts`) with fake config in `/tmp`.
7. No external posts not requested: nothing outside this repo's own issue or PR on GitHub (no comments elsewhere, chats, or webhooks). Never call the memory service at `100.91.167.116:8888`.
8. Work autonomously, without pausing to ask. When a decision belongs to Filipe, record it in the PR.

### Behavior and quality

9. The CLI behaves exactly like the Meu Dinheiro web app. When web behavior matters, consult the local web bundle (`$HOME/.mdcli-team/ref/mdb.js` on the maintainer's machines): search with `rg` and read only the relevant snippets, without copying the bundle into the repo. If the copy does not exist, say that in the PR and do not guess. If the web does something different from the request, follow the web and say that in the PR.
10. Filipe's decisions (e.g. import decisions, issue #64): if the web rule contradicts his decision, do not change the behavior. Document the conflict in the PR (decision, web rule, and evidence) and leave it for him to decide.
11. Reproduce before fixing, with the mock, and fix the root cause, not the symptom.
12. Complement the test rule: every new test asserts observable behavior and fails without the fix. Prove it by reverting the fix locally once, and say that in the PR. Bug tests run the real CLI (`bin/cli.ts` against the mock). Do not compute expected values with production functions. Do not delete or loosen assertions, and do not increase timeouts.
13. Turn a recurring error into a rule (local ESLint rule in `eslint-rules/` with a message that says the fix, or a guard test) when cheap, and prove the rule fails on the old code.

## Pull requests (implementation flow)

14. Open the PR with `gh pr create -R fm1randa/mdcli --base main`. The body is in Brazilian Portuguese with `Closes #n` for each issue, the root cause, what changed, and how it was verified (reproduction before and after). Then wait for CI (`gh pr checks <n> -R fm1randa/mdcli --watch`) with a tool timeout of at least 20 minutes, and fix if `verify` fails.
15. The implementation session does not run review rounds: review rounds come in separate sessions.
16. The session's final message carries the PR URL, the pushed SHA, and the `verify.sh` result, with the last line exactly:

```
PR RESULT: pr=<number> pushed <sha>, verify=<OK or FAIL>
```

## Review rounds (round N of PR P)

17. Confirm `HEAD` equals `origin/<branch>` (`git fetch origin && git status -sb`) and get context on GitHub (`gh pr view`, `gh issue view`, `git log origin/main..HEAD`). When `git log HEAD..origin/main` is not empty, merge `origin/main` before reviewing or pushing so the round sees the trunk the merge will land on.
18. When a review round is requested, follow the `/code-review` skill process on axes (a) repo standards (types, i18n, file size limits, CLI-boundary validation, non-tautological tests, no deleted/loosened assertions, no larger timeouts) and (b) spec (the issue resolved consistently and behavior matching the web).
19. Classify each finding as high, medium, low, or taste and write in `REVIEW-<P>-r<N>.md` at the repo root, without committing (`.gitignore` ignores `REVIEW-*.md`, and `scripts/verify.sh` fails when one is tracked).
20. Fix every high and medium finding and the cheap low ones, with commits in English (conventional commits). Run `verify.sh` as in item 3 and push non-force to the PR branch if there is a commit.
21. Update the PR body in Brazilian Portuguese to match the final diff and evidence (`gh pr edit <P> --body-file <file>`; if the GraphQL call fails, use `gh api -X PATCH repos/fm1randa/mdcli/pulls/<P> -F body=@<file>`).
22. At the end, list findings with severity (or say the round came out fully clean), what was fixed, and the `verify.sh` result. The last line is exactly (the maintainer automation depends on this format):

```
ROUND RESULT: high=<n> medium=<n> low=<n> taste=<n>, pushed <sha or "nothing">
```

23. Stop adding instances after two consecutive rounds find the same defect class. Rebuild the check from the base corpus and run `/reflect` instead of opening another round; a loop whose only exit is an empty round has no stop rule.
