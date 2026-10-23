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
    // Money is formatted in one place, signed by default.
    files: ["src/**/*.ts"],
    ignores: ["src/utils/currency.ts"],
    rules: { "local/no-raw-currency": "error" },
  },
  {
    // User input goes through the strict parse helpers; payloads match
    // their types instead of being cast.
    files: ["src/commands/**/*.ts", "src/lib/aliases.ts"],
    rules: { "local/no-number-call": "error", "local/no-double-cast": "error" },
  },
  {
    // A card's due date is read only in card-invoice.ts (cardDueAnchor, ownDueDate).
    files: ["src/**/*.ts"],
    ignores: ["src/commands/entries/card-invoice.ts"],
    rules: { "local/no-due-anchor-fallback": "error" },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
