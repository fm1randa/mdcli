import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import type { Command as Commander } from 'commander';
import { buildProgram } from '../src/program.js';

const ROOT = `${import.meta.dir}/..`;

// Every command a user can run has a `mdcli <command path>` example in both
// READMEs, and every visible long option of those commands appears in both.
// Hidden options are skipped on purpose: `--scheduled` is a hidden deprecated
// alias of `--pending`. Walks the real commander tree, so a new command or
// option fails here until it is documented (entries import and sync shipped
// without one).
type Command = { path: string; options: string[] };

function walk(command: Commander, prefix: string[]): Command[] {
  return command.commands.flatMap((sub) => {
    const path = [...prefix, sub.name()];
    return sub.commands.length === 0
      ? [{
          path: path.join(' '),
          options: sub.options.flatMap((option) =>
            !option.hidden && typeof option.long === 'string' ? [option.long] : []
          ),
        }]
      : walk(sub, path);
  });
}

const PROGRAM = await buildProgram();
const COMMANDS = walk(PROGRAM, ['mdcli']);
const PATHS = COMMANDS.map((command) => command.path);

/** Every long option any command declares, hidden ones included. */
function declaredOptions(command: Commander): string[] {
  return [
    ...command.options.flatMap((option) => (typeof option.long === 'string' ? [option.long] : [])),
    ...command.commands.flatMap(declaredOptions),
  ];
}

// Commander answers --help on every command without listing it in `options`.
const KNOWN_OPTIONS = new Set(['--help', ...declaredOptions(PROGRAM)]);

/** The long options the text mentions that no command accepts (the inverse of #194). */
function unknownOptions(text: string): string[] {
  const mentioned = text.match(/(?<![\w-])--[a-z][\w-]*/g) ?? [];
  return [...new Set(mentioned)].filter((option) => !KNOWN_OPTIONS.has(option));
}

/** Escape regex metacharacters so a literal command path or option can be matched. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The command paths the file never shows; `mdcli tags list` does not count as `mdcli tags list-all`. */
function undocumented(file: string): string[] {
  const text = readFileSync(`${ROOT}/${file}`, 'utf8');
  return PATHS.filter((path) => !new RegExp(`${escape(path)}(?![\\w-])`).test(text));
}

/** The `path option` pairs the file never shows; `--to` does not count as `--to-account`. */
function undocumentedOptions(file: string): string[] {
  const text = readFileSync(`${ROOT}/${file}`, 'utf8');
  return COMMANDS.flatMap(({ path, options }) =>
    options
      .filter((option) => !new RegExp(`${escape(option)}(?![\\w-])`).test(text))
      .map((option) => `${path} ${option}`),
  );
}

describe('README command coverage', () => {
  test('walks nested commands down to the leaves', () => {
    expect(PATHS).toContain('mdcli entries import run');
    expect(PATHS).toContain('mdcli accounts alias rm');
    expect(PATHS).not.toContain('mdcli entries import');
  });

  test('reports a long option no command accepts', () => {
    expect(unknownOptions('mdcli entries import run --account principal --no-ai --help')).toEqual(['--no-ai']);
  });

  for (const file of ['README.md', 'README.en.md']) {
    test(`${file} shows every command`, () => {
      const missing = undocumented(file);
      if (missing.length > 0) {
        throw new Error(
          `${file} has no example of: ${missing.join(', ')}. ` +
            'Add a usage line for each one to README.md and its translation to README.en.md.',
        );
      }
    });

    test(`${file} shows every command option`, () => {
      const missing = undocumentedOptions(file);
      if (missing.length > 0) {
        throw new Error(
          `${file} has no example of: ${missing.join(', ')}. ` +
            'Document every long option in README.md and its translation to README.en.md.',
        );
      }
    });

    test(`${file} mentions only options the CLI accepts`, () => {
      const unknown = unknownOptions(readFileSync(`${ROOT}/${file}`, 'utf8'));
      if (unknown.length > 0) {
        throw new Error(
          `${file} mentions options no command accepts: ${unknown.join(', ')}. ` +
            'Remove them from README.md and README.en.md, or add the option to the CLI.',
        );
      }
    });
  }
});
