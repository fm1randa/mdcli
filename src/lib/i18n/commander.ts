import type { Command } from 'commander';
import { getLanguage, t } from './index.js';

/**
 * The visible strings commander owns: the help headings, the `[options]` and
 * `[command]` tokens of the usage line, and its error messages. Everything goes
 * through its public API (configureHelp/configureOutput); commander itself is
 * never patched.
 */

const HEADINGS: Record<string, () => string> = {
  'Usage:': () => t('helpUsage'),
  'Options:': () => t('helpOptions'),
  'Commands:': () => t('helpCommands'),
  'Arguments:': () => t('helpArguments'),
  'Global Options:': () => t('helpGlobalOptions'),
};

function styleTitle(title: string): string {
  return HEADINGS[title]?.() ?? title;
}

/** The usage line's own placeholders, e.g. `mdcli [options] [command]`. */
function styleUsage(usage: string): string {
  if (getLanguage() === 'en') return usage;
  return usage
    .replaceAll('[options]', t('helpOptionsToken'))
    .replaceAll('[command]', t('helpCommandToken'));
}

/** A subcommand's term in the command list, e.g. `list [options]`. */
function styleSubcommandTerm(term: string): string {
  if (getLanguage() === 'en') return term;
  return term.replaceAll('[options]', t('helpOptionsToken'));
}

const SUGGESTION = /\n\(Did you mean (one of )?(.+?)\?\)$/;

function translateSuggestion(many: boolean, names: string): string {
  return `\n(${many ? t('commanderSuggestionMany', names) : t('commanderSuggestionOne', names)})`;
}

/** Commander's own error message in the current language, keeping its shape and exit code. */
function translateCommanderError(text: string): string {
  if (getLanguage() === 'en') return text;

  const trailingNewline = text.endsWith('\n');
  const message = trailingNewline ? text.slice(0, -1) : text;
  const suggestion = SUGGESTION.exec(message);
  const translatedSuggestion = suggestion
    ? translateSuggestion(suggestion[1] !== undefined, suggestion[2])
    : '';
  const body = suggestion ? message.slice(0, suggestion.index) : message;
  const suffix = translatedSuggestion + (trailingNewline ? '\n' : '');

  const patterns: Array<[RegExp, (match: RegExpExecArray) => string]> = [
    [
      /^error: unknown command '([^']*)'$/,
      (match) => t('commanderUnknownCommand', match[1]),
    ],
    [
      /^error: unknown option '([^']*)'$/,
      (match) => t('commanderUnknownOption', match[1]),
    ],
    [
      /^error: missing required argument '([^']*)'$/,
      (match) => t('commanderMissingArgument', match[1]),
    ],
    [
      /^error: option '([^']*)' argument missing$/,
      (match) => t('commanderOptionArgumentMissing', match[1]),
    ],
    [
      /^error: required option '([^']*)' not specified$/,
      (match) => t('commanderRequiredOption', match[1]),
    ],
    [
      /^error: option '([^']*)' argument '([^']*)' is invalid\.$/,
      (match) => `${t('commanderInvalidOptionArgument', match[1], match[2])}.`,
    ],
    [
      /^error: command-argument value '([^']*)' is invalid for argument '([^']*)'\.$/,
      (match) => `${t('commanderInvalidArgument', match[1], match[2])}.`,
    ],
    [
      /^error: option '([^']*)' cannot be used with option '([^']*)'$/,
      (match) => t('commanderConflictingOptions', match[1], match[2]),
    ],
    [
      /^error: too many arguments( for '([^']*)')?\. Expected (\d+) (argument[s]?) but got (\d+): (.*)\.$/,
      (match) => {
        const subcommand = match[2] ? ` para '${match[2]}'` : '';
        const expected = `${match[3]} ${match[4] === 'arguments' ? 'argumentos' : 'argumento'}`;
        return t('commanderExcessArguments', subcommand, expected, match[5], match[6]);
      },
    ],
  ];

  for (const [pattern, format] of patterns) {
    const match = pattern.exec(body);
    if (match) return format(match) + suffix;
  }

  return body.replace(/^error: /, 'erro: ') + suffix;
}

/** The `outputError` hook: commander's message, translated when the language is pt-BR. */
function outputError(text: string, write: (message: string) => void): void {
  write(translateCommanderError(text));
}

/**
 * Applies the localized help and error hooks to `root` and every command under
 * it. Commander copies these settings only into commands created with
 * `.command()`, so commands built on their own and added with `addCommand()`
 * would otherwise keep the English defaults.
 */
export function applyCommanderLocalization(root: Command): void {
  root
    .configureHelp({ styleTitle, styleUsage, styleSubcommandTerm })
    .configureOutput({ outputError })
    .helpOption('-h, --help', t('helpOptionDescription'));
  if (root.commands.length > 0) {
    root.helpCommand('help [command]', t('helpCommandDescription'));
  }
  for (const command of root.commands) {
    applyCommanderLocalization(command);
  }
}
