# Agent Instructions

## Language

Everything code-related must be written in American English. Examples: variables, functions, comments, commits.
Issues and pull requests must be written in Brazilian Portuguese.

`README.md` is written in Brazilian Portuguese and is the reference version. `README.en.md` is its English translation: whenever a PR changes `README.md`, update `README.en.md` in the same PR to match, and update the comment on line 1 of `README.en.md`:

- `readme-blob:` the git blob hash of the `README.md` the translation matches, from `git hash-object README.md` run on the final `README.md`. `scripts/verify.sh` (step `readme sync`) fails when it differs from the current `README.md`, so a `README.md` change without a synced translation does not pass CI.
- The commit SHA (short after `@`, full after `base:`): the commit on `main` the translation was last synced from. In a PR that changes `README.md` itself, keep the `main` commit the branch starts from (the squash-merge SHA is not known in advance); the blob is what pins the exact content.

## Post-Completion Verification

After completing any user request that modifies code:

1. Run `scripts/verify.sh`. It is the official verification and the same check CI runs (the `verify` job required by branch protection on `main`): install, typecheck, lint, knip, the test suite, and an end-to-end run of the real CLI against a local mock API.
2. The run passes only when it exits with code 0 and the last line is `VERIFICAÇÃO OK`. On failure it ends with `VERIFICAÇÃO FALHOU: <steps>`.
3. Fix any issues it reports. To iterate on a single step, you can run it directly (`bun run typecheck`, `bun run lint`, `bun run knip`, `bun run test`), but finish with a full `scripts/verify.sh` run.
4. Ensure no new warnings are introduced

## Versionamento

- CalVer `YYYY.M.D` sem zeros à esquerda (ex.: `2026.10.13`), válido como semver para o npm.
- A versão só sobe no `package.json` ao fazer release (é a fonte única; `--version` e `verify.sh` leem de lá).
- Segunda release no mesmo dia: `YYYY.M.D-N` com N a partir de 2 (ex.: `2026.10.13-2`). Atenção: no semver isso é pré-release e ordena *antes* de `2026.10.13`; use só quando necessário e prefira a data do dia seguinte se possível.

## Releases

A Release is what reaches users: global installs self-update only to the latest GitHub Release, never to the tip of `main` (see `docs/adr/0002-self-update-from-tagged-releases.md`).

- Quem faz: o bot mantenedor, ao fim de todo dia em que houve merge `feat` ou `fix` (mudança visível pra quem usa); dias só com `test`, `docs`, `refactor` ou `chore` não geram release. O Filipe pode pedir uma release a qualquer momento.
- Procedimento:
  1. Num PR `chore(release): vYYYY.M.D`, suba `version` no `package.json` para a data (regras de Versionamento acima); `scripts/verify.sh` e o check `verify` precisam passar; faça squash-merge.
  2. Crie a tag anotada `vYYYY.M.D` no commit do merge em `main` e faça push da tag. A tag tem de ser igual a `v` + `version` do `package.json` desse commit.
  3. Publique a GitHub Release dessa tag (não draft, não prerelease, marcada como latest), título `vYYYY.M.D`.
  4. Notas em pt-BR: resumo das mudanças visíveis pra quem usa desde a release anterior, tirado do `/workspace/mdcli-team/changelog.md`, e no fim a lista de links dos PRs incluídos.
  5. Registre a release no `changelog.md`.
- Nunca mova nem apague uma tag publicada; para corrigir, faça uma nova release.


Tautological tests are considered harmful. Do not write tests that only re-assert a mock or stub, re-implement the code under test, assert constants or types, or cannot fail when the behavior breaks.
