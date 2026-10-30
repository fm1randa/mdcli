import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import local from "./eslint-rules/index.js";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
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
    // Money is formatted and counted in cents in one place, signed by default.
    files: ["src/**/*.ts"],
    ignores: ["src/utils/currency.ts"],
    rules: { "local/no-raw-currency": "error", "local/no-raw-cents": "error" },
  },
  {
    // Strings become numbers only through the strict parse helpers.
    files: ["src/**/*.ts"],
    ignores: ["src/utils/parse.ts"],
    rules: { "local/no-loose-number": "error" },
  },
  {
    // User input payloads match their types instead of being cast.
    files: ["src/commands/**/*.ts", "src/lib/aliases.ts"],
    rules: { "local/no-double-cast": "error" },
  },
  {
    // An empty table cell is written by cell() alone.
    files: ["src/**/*.ts"],
    ignores: ["src/utils/text.ts"],
    rules: { "local/no-raw-dash": "error" },
  },
  {
    // A card's due date is read only in card-invoice.ts (cardDueAnchor, ownDueDate).
    files: ["src/**/*.ts"],
    ignores: ["src/commands/entries/card-invoice.ts"],
    rules: { "local/no-due-anchor-fallback": "error" },
  },
  {
    // "Today" comes from now()/today() in src/lib/dates.ts, which tests pin.
    files: ["src/commands/**/*.ts"],
    rules: { "local/no-ambient-clock": "error" },
  },
  {
    // Entry sign logic by type lives only in src/commands/entries/type.ts.
    files: ["src/**/*.ts"],
    ignores: ["src/commands/entries/type.ts"],
    rules: { "local/no-type-sign-ternary": "error" },
  },
  {
    // --since accepts only the last 90 days: tests pass a date relative to today.
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
    // Short options with = must be preprocessed before commander parses argv (#151).
    files: ["bin/cli.ts"],
    rules: { "local/no-short-option-equals": "error" },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
