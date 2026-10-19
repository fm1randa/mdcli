import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
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
  {
    // Number('') is 0, Number('1e3') 1000, Number('0x10') 16: user input goes
    // through the strict helpers instead (Jardinagem 2026-10-19).
    files: ["src/commands/**/*.ts", "src/lib/aliases.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='Number']",
          message: "Number() accepts '', '1e3', '0x10' and 'Infinity'. Use parseId, parseInteger or parseAmount from src/utils/parse.ts.",
        },
      ],
    },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
