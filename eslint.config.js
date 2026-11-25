import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import local from "./eslint-rules/index.js";

const API_CLIENT = ["src/lib/api.ts", "src/lib/api/**"];

/** The API's raw writers, imported from a module `regex` names as the client. */
function apiWrites(regex) {
  return {
    regex,
    importNames: ["apiPost", "apiPut", "apiDelete", "request"],
    message: "Call the API's write functions only inside src/lib/api/**: add a named function for the endpoint to its resource module there (e.g. saveBudgetGoals in src/lib/api/budget.ts), export it from src/lib/api.ts, and call that instead.",
  };
}

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // A disable that no longer suppresses anything is stale: remove it.
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "eslint-rules/*.js"],
          // The default of 8 counts this config and every rule file; they are
          // small, so the cost of linting them outside a tsconfig is too.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Keep files small: split by responsibility instead of growing god files.
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Each ban is its own rule in eslint-rules/ (the "why" lives there), so a
  // block scopes one ban without replacing the others' options.
  { plugins: { local } },
  {
    // Every eslint-disable says why the exception is safe, after "--".
    rules: { "local/disable-directive-description": "error" },
  },
  {
    // Money is formatted and counted in cents in one place, signed by default.
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/utils/currency.ts"],
    rules: { "local/no-raw-currency": "error", "local/no-raw-cents": "error" },
  },
  {
    // Strings become numbers only through the strict parse helpers.
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/utils/parse.ts"],
    rules: { "local/no-loose-number": "error" },
  },
  {
    // User input payloads match their types instead of being cast.
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    rules: { "local/no-double-cast": "error" },
  },
  {
    // Entry and occurrence IDs are branded only by their constructors (#277).
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/lib/entry-id-brands.ts"],
    rules: { "local/no-brand-cast": "error" },
  },
  {
    // An `any` reaches a typed slot unchecked, a branded one included
    // (`const id: EntryId = JSON.parse(text)`, #290). test/** reads CLI output
    // through JSON.parse in hundreds of assertions and brands nothing the CLI runs.
    files: ["src/**/*.ts", "bin/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  {
    // An empty table cell is written by cell() alone.
    files: ["src/**/*.ts", "test/**/*.ts"],
    ignores: ["src/utils/text.ts"],
    rules: { "local/no-raw-dash": "error" },
  },
  {
    // A card's due date is read only in card-invoice.ts (cardDueAnchor, ownDueDate).
    // test/** is exempt in eslint-rules/scope-exemptions.json: fixtures name the field.
    files: ["src/**/*.ts"],
    ignores: ["src/commands/entries/card-invoice.ts"],
    rules: { "local/no-due-anchor-fallback": "error" },
  },
  {
    // "Today" comes from now()/today() in src/lib/dates.ts, which tests pin.
    // The narrower scope is named in eslint-rules/scope-exemptions.json.
    files: ["src/commands/**/*.ts"],
    rules: { "local/no-ambient-clock": "error" },
  },
  {
    // Entry sign logic by type lives only in src/commands/entries/type.ts.
    files: ["src/**/*.ts", "test/**/*.ts"],
    ignores: ["src/commands/entries/type.ts"],
    rules: { "local/no-type-sign-ternary": "error" },
  },
  {
    // A category name is resolved only in src/lib/category-resolution.ts.
    files: ["src/**/*.ts"],
    ignores: ["src/lib/category-resolution.ts"],
    rules: { "local/no-category-name-resolution": "error" },
  },
  {
    // --since accepts only the last 90 days: tests pass a date relative to today.
    // src/** is exempt in eslint-rules/scope-exemptions.json: commands read the flag value.
    files: ["test/**/*.ts"],
    ignores: ["test/dates.test.ts"],
    rules: {
      "local/no-literal-since": "error",
      "no-restricted-imports": ["error", {
        paths: [{ name: "../src/lib/dates.js", message: "Tests must not import production date functions; use localDay() from test/helpers.ts instead." }],
      }],
    },
  },
  {
    // A test that compares a literal to itself, or asserts the text of a
    // src/ or bin/ file, cannot fail when the behavior breaks (issue #186).
    // Probes are bun:test files too (#303).
    files: ["test/**/*.ts"],
    rules: { "local/no-tautological-expect": "error" },
  },
  {
    // Suite deadlines live in test/timeouts.ts. A literal, or one local bound
    // to a literal, is a second copy (#303).
    files: ["test/**/*.ts"],
    ignores: ["test/timeouts.ts"],
    rules: { "local/no-loose-deadline": "error" },
  },
  {
    // Short options with = must be preprocessed before commander parses argv (#151).
    // src/** and test/** are exempt in eslint-rules/scope-exemptions.json.
    files: ["bin/cli.ts"],
    rules: { "local/no-short-option-equals": "error" },
  },
  {
    // An Error message reaches the user, so it comes from the i18n catalog
    // (#350). test/** and scripts/** are exempt in scope-exemptions.json.
    files: ["src/**/*.ts", "bin/**/*.ts"],
    rules: { "local/no-raw-error-message": "error" },
  },
  {
    // Exit only through exitAfterFlush(), which flushes stdout first.
    files: ["src/**/*.ts", "test/**/*.ts", "bin/**/*.ts"],
    rules: { "local/no-bare-process-exit": "error" },
  },
  {
    // scripts/ spawns git, gh and bun only through scripts/git.ts (#260).
    // src/** is exempt in eslint-rules/scope-exemptions.json. The default
    // syncNames is "self", so spawnSync in a gate stays this rule.
    files: ["scripts/**/*.ts"],
    ignores: ["scripts/git.ts"],
    rules: { "local/no-raw-spawn": "error" },
  },
  {
    // test/ spawns only through test/run.ts. Synchronous names stay on
    // no-sync-spawn, so one spawnSync is one local rule (#301, #303).
    files: ["test/**/*.ts"],
    ignores: ["test/run.ts"],
    rules: { "local/no-raw-spawn": ["error", { syncNames: "sync-rule" }] },
  },
  {
    // Sync spawn has one owner. That file may import the three names only from
    // node:child_process. A named import from "bun" captured before the guard
    // still starts the child (Bun 1.4.2, #301). The guard, its probe, and the
    // contract probe name the raw calls on purpose. bin/ is included so a
    // named import in bin/cli.ts cannot skip the rule.
    files: ["src/**/*.ts", "test/**/*.ts", "bin/**/*.ts"],
    ignores: ["test/sync-spawn-guard.ts", "test/probes/sync-spawn.ts", "test/probes/sync-child-contract.ts"],
    rules: { "local/no-sync-spawn": "error" },
  },
  {
    // scripts/git.ts also owns --base, the base...head diff and the git calls
    // of the gates' tests (#268). src/** is exempt in scope-exemptions.json.
    files: ["scripts/**/*.ts", "test/**/*.ts"],
    ignores: ["scripts/git.ts"],
    rules: { "local/no-git-copy": "error" },
  },
  {
    // Flag values go through parseValueFlag in scripts/git.ts, never
    // argv[++index], which swallows the next flag as the value (#353).
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts", "bin/**/*.ts"],
    rules: { "local/no-hand-argv": "error" },
  },
  {
    // The Meu Dinheiro host lives only in src/lib/meu-dinheiro-host.ts (#279).
    // Help texts in the i18n catalogs name the site to the user, not a URL the
    // CLI calls. test/** is exempt in eslint-rules/scope-exemptions.json.
    files: ["src/**/*.ts", "scripts/**/*.ts", "bin/**/*.ts"],
    ignores: ["src/lib/meu-dinheiro-host.ts", "src/lib/i18n/catalog/**"],
    rules: { "local/no-host-literal": "error" },
  },
  {
    // The API client owns every write, one named function per endpoint in its
    // resource module (#326, #354), so scripts/write-surface.ts derives the
    // writers from src/lib/api/** alone (#348).
    files: ["src/**/*.ts", "bin/**/*.ts"],
    ignores: API_CLIENT,
    rules: { "no-restricted-imports": ["error", { patterns: [apiWrites("(^|/)lib/api(/request)?(\\.js)?$")] }] },
  },
  {
    // Inside src/lib/ the client is also reached by a relative path; outside
    // it, ./api.js is another module (src/types/api.ts).
    files: ["src/lib/**/*.ts"],
    ignores: API_CLIENT,
    rules: { "no-restricted-imports": ["error", { patterns: [apiWrites("(^|/)lib/api(/request)?(\\.js)?$|^(\\.\\.?/)+api(/request)?(\\.js)?$")] }] },
  },
  {
    // scripts/mock-http.ts owns the mock's error answers (#276, #286).
    files: ["scripts/mock-*.ts"],
    ignores: ["scripts/mock-http.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector:
          ":matches(:matches(CallExpression[callee.object.name='Response'], NewExpression[callee.name='Response']) Property[key.name='status'] > Literal, CallExpression[callee.name='json'] > Literal.arguments:nth-child(2))[raw=/^4\\d\\d$/]",
        message: "Answer a 4xx through scripts/mock-http.ts (notFound, badRequest, unauthorized), never Response.json or json() with a 4xx status; it owns the error body every route returns.",
      }],
    },
  },
  {
    files: ["src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
