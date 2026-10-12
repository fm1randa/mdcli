# Agent Instructions

## Language

Everything code-related must be written in American English. Examples: variables, functions, comments, commits.
Issues and pull requests must be written in Brazilian Portuguese.

## Post-Completion Verification

After completing any user request that modifies code:

1. Run `bun run lint` to check for ESLint errors
2. Run `bun run knip` to detect unused files, dependencies, and exports
3. Run `bun run test` to run the test suite
4. Fix any issues found by lint, knip, or the tests
5. Ensure no new warnings are introduced
