# Agent Instructions

## Post-Completion Verification

After completing any user request that modifies code:

1. Run `bun run lint` to check for ESLint errors
2. Run `bun run knip` to detect unused files, dependencies, and exports
3. Fix any issues found by lint or knip
4. Ensure no new warnings are introduced
