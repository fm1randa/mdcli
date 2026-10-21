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

// A card's invoice anchor comes from cardDueAnchor alone (Jardinagem
// 2026-10-21: three paths had three fallbacks for a card without one).
const DUE_ANCHOR = {
  selector: "LogicalExpression[operator='??'][left.property.name='proximoVencimento']",
  message: "Use cardDueAnchor (src/commands/entries/card-invoice.ts) for a card's due date: one rule for a card without proximoVencimento.",
};

// `as unknown as` hid that the update payload did not match its type, right
// where the -p status bug lived (Jardinagem 2026-10-21): fix the type instead.
const DOUBLE_CAST = {
  selector: "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
  message: "`as unknown as` hides a type mismatch. Make the value match the type (or fix the type in src/types).",
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
    ignores: ["src/utils/currency.ts", "src/commands/entries/card-invoice.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT, DUE_ANCHOR] },
  },
  {
    files: ["src/commands/entries/card-invoice.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT] },
  },
  {
    // Number('') is 0, Number('1e3') 1000, Number('0x10') 16: user input goes
    // through the strict helpers instead (Jardinagem 2026-10-19). Repeats
    // CURRENCY_FORMAT: a later block replaces the rule's options, not merges.
    files: ["src/commands/**/*.ts", "src/lib/aliases.ts"],
    ignores: ["src/commands/entries/card-invoice.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT, NUMBER_CALL, DUE_ANCHOR, DOUBLE_CAST] },
  },
  {
    files: ["src/commands/entries/card-invoice.ts"],
    rules: { "no-restricted-syntax": ["error", CURRENCY_FORMAT, NUMBER_CALL, DOUBLE_CAST] },
  },
  {
    ignores: ["node_modules", "dist"],
  }
);
