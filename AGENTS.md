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

1. Run `scripts/verify.sh`. It is the official verification and the same script the `verify` CI job runs, which branch protection on `main` requires. It runs install, readme sync, typecheck, lint, knip, the test suite, a dependency audit, and an end-to-end run of the real CLI against a local mock API.
2. Treat the run as passing only when it exits 0 and its last line is `VERIFICAÇÃO OK`. A failure ends with `VERIFICAÇÃO FALHOU: <steps>`.
3. Fix everything it reports. To iterate on one step, run it directly (`bun run typecheck`, `bun run lint`, `bun run knip`, `bun run test`), then finish with a full `scripts/verify.sh` run.
4. Introduce no new warnings.

## Tests

Do not write tautological tests: a test is tautological when it only re-asserts a mock or stub, re-implements the code under test, asserts constants or types, or cannot fail when the behavior breaks.

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

Every agent session starts with `/poteto-mode <short-intention>` (e.g. `/poteto-mode fix bug #321`). The task details live in the issue or PR; the rules below are permanent.

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

14. Open the PR with `gh pr create -R fm1randa/mdcli --base main`. The body is in Brazilian Portuguese with `Closes #n` for each issue, the root cause, what changed, and how it was verified (reproduction before and after). Then wait for CI (`gh pr checks <n> -R fm1randa/mdcli --watch`) and fix if `verify` fails.
15. The implementation session does not run review rounds: review rounds come in separate sessions.
16. The session's final message carries the PR URL, the pushed SHA, and the `verify.sh` result, with the last line exactly:

```
PR RESULT: pr=<number> pushed <sha>, verify=<OK or FAIL>
```

## Review rounds (round N of PR P)

17. Confirm `HEAD` equals `origin/<branch>` (`git fetch origin && git status -sb`) and get context on GitHub (`gh pr view`, `gh issue view`, `git log origin/main..HEAD`).
18. Follow the `/code-review` skill process on axes (a) repo standards (types, i18n, file size limits, CLI-boundary validation, non-tautological tests, no deleted/loosened assertions, no larger timeouts) and (b) spec (the issue resolved consistently and behavior matching the web).
19. Classify each finding as high, medium, low, or taste and write in `REVIEW-<P>-r<N>.md` at the repo root, without committing (add it to the local exclude file, `git rev-parse --git-path info/exclude`, if needed).
20. Fix every high and medium finding and the cheap low ones, with commits in English (conventional commits). Run `verify.sh` as in item 3 and push non-force to the PR branch if there is a commit.
21. Update the PR body in Brazilian Portuguese to match the final diff and evidence (`gh pr edit <P> --body-file <file>`; if the GraphQL call fails, use `gh api -X PATCH repos/fm1randa/mdcli/pulls/<P> -F body=@<file>`).
22. At the end, list findings with severity (or say the round came out fully clean), what was fixed, and the `verify.sh` result. The last line is exactly (the maintainer automation depends on this format):

```
ROUND RESULT: high=<n> medium=<n> low=<n> taste=<n>, pushed <sha or "nothing">
```
