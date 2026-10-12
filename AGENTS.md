# Agent Instructions

## Language

Everything code-related must be written in American English. Examples: variables, functions, comments, commits.
Issues and pull requests must be written in Brazilian Portuguese.

## Post-Completion Verification

After completing any user request that modifies code:

1. Run `scripts/verify.sh`. It is the official verification and the same check CI runs (the `verify` job required by branch protection on `main`): install, typecheck, lint, knip, the test suite, and an end-to-end run of the real CLI against a local mock API.
2. The run passes only when it exits with code 0 and the last line is `VERIFICAÇÃO OK`. On failure it ends with `VERIFICAÇÃO FALHOU: <steps>`.
3. Fix any issues it reports. To iterate on a single step, you can run it directly (`bun run typecheck`, `bun run lint`, `bun run knip`, `bun run test`), but finish with a full `scripts/verify.sh` run.
4. Ensure no new warnings are introduced
