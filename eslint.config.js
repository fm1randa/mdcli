import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Money is formatted in one place, signed by default (Jardinagem 2026-10-19:
// four copies, two of them dropping the sign).
const CURRENCY_FORMAT = {
  selector: "CallExpression[callee.property.name='toLocaleString'] Property[key.name='style'][value.value='currency']",
  message: "Format money with formatCurrency (signed) or formatMagnitude from src/utils/currency.ts.",
};

const NUMBER_CALL = {
  selector: "CallExpression[callee.name='Number']",
  message: "Number() accepts '', '1e3', '0x10' and 'Infinity'. Use parseId, parseInteger or parseAmount from src/utils/parse.ts.",
};

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
    files: ["src/**/*.ts"],
    ignores: ["src/utils/currency.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT] },
  },
  {
    // Number('') is 0, Number('1e3') 1000, Number('0x10') 16: user input goes
    // through the strict helpers instead (Jardinagem 2026-10-19). Repeats
    // CURRENCY_FORMAT: a later block replaces the rule's options, not merges.
    files: ["src/commands/**/*.ts", "src/lib/aliases.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT, NUMBER_CALL] },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
