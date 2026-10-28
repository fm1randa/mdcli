import { ptBRCatalog } from './pt-BR.js';
import { enCatalog } from './en.js';
import type { Catalog, MessageArgs, MessageKey } from './types.js';

/** The languages the CLI ships, in the order the error message lists them. */
const LANGUAGES = ['pt-BR', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Filipe's choice: Brazilian Portuguese, never inferred from the system locale. */
const DEFAULT_LANGUAGE: Language = 'pt-BR';

const CATALOGS: Record<Language, Catalog> = {
  'pt-BR': ptBRCatalog,
  en: enCatalog,
};

/** The accepted values as the error message lists them: "pt-BR, en". */
export function acceptedLanguages(): string {
  return LANGUAGES.join(', ');
}

/**
 * A language name, or undefined when it is not one of ours. Case-insensitive,
 * and accepts the obvious variants of each language: `pt`, `pt-BR`, `pt_BR`,
 * `pt-br`, `en`, `en-US`, `en_us`, and other `pt-*`/`en-*` tags.
 */
function parseLanguage(value: string): Language | undefined {
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return undefined;
}

/** `--lang <value>` or `--lang=<value>`, anywhere in argv; the last one wins. */
function readLanguageFlag(argv: readonly string[]): { found: boolean; value?: string } {
  let found = false;
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lang') {
      found = true;
      const next = argv[index + 1];
      value = next !== undefined && !next.startsWith('-') ? next : undefined;
      index += 1;
    } else if (arg.startsWith('--lang=')) {
      found = true;
      value = arg.slice('--lang='.length);
    }
  }
  return { found, value };
}

/** argv without the `--lang` flag and its value: the language is resolved before commander parses. */
export function stripLanguageFlag(argv: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lang') {
      index += 1;
    } else if (!arg.startsWith('--lang=')) {
      result.push(arg);
    }
  }
  return result;
}

interface LanguageSelection {
  language: Language;
  /** The value that was refused, or '' when --lang had no value. */
  invalid?: string;
}

/**
 * The language, in this precedence: --lang > MDCLI_LANG > pt-BR. LANG,
 * LC_ALL and LC_MESSAGES are deliberately ignored: a system locale of en_US or
 * C (common on macOS and in CI) would silently override the pt-BR default.
 */
function selectLanguage(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
): LanguageSelection {
  const flag = readLanguageFlag(argv);
  if (flag.found) {
    if (flag.value === undefined || flag.value === '') {
      return { language: DEFAULT_LANGUAGE, invalid: '' };
    }
    const language = parseLanguage(flag.value);
    return language === undefined
      ? { language: DEFAULT_LANGUAGE, invalid: flag.value }
      : { language };
  }

  const fromEnv = env.MDCLI_LANG;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    const language = parseLanguage(fromEnv);
    return language === undefined
      ? { language: DEFAULT_LANGUAGE, invalid: fromEnv }
      : { language };
  }

  return { language: DEFAULT_LANGUAGE };
}

let currentLanguage: Language = DEFAULT_LANGUAGE;
let refusedLanguage: string | undefined;

/**
 * Resolves the language once, before the command tree is built, so help text
 * and messages are created in the right language. Called by
 * src/lib/i18n/bootstrap.ts, which bin/cli.ts imports first.
 */
export function bootstrapLanguage(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): void {
  const selection = selectLanguage(argv, env);
  currentLanguage = selection.language;
  refusedLanguage = selection.invalid;
}

/** The language value that was refused at startup, if any. */
export function refusedLanguageValue(): string | undefined {
  return refusedLanguage;
}

export function getLanguage(): Language {
  return currentLanguage;
}

/** A message in the current language. Parameters are checked against the catalog. */
export function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
  return message(currentLanguage, key, ...args);
}

/** A message in `language`. Parameters are checked against the catalog. */
function message<K extends MessageKey>(
  language: Language,
  key: K,
  ...args: MessageArgs<K>
): string {
  const entry = CATALOGS[language][key] as (...params: MessageArgs<K>) => string;
  return entry(...args);
}

