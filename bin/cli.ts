#!/usr/bin/env bun

// Resolves the language before anything builds the command tree or a message,
// so --help and the first error already come out in the chosen language.
import '../src/lib/i18n/bootstrap.js';

import { checkForUpdate } from '../src/lib/self-update.js';
import { packageRoot, program } from '../src/program.js';
import { acceptedLanguages, refusedLanguageValue, stripLanguageFlag, t } from '../src/lib/i18n/index.js';

/** Preprocess argv so short options with `=` (`-v=46.33`) work: commander
  treats `=` as a separator only for long options, so `-v=46.33` arrives
  as value `=46.33`. We split it centrally for every command and option. */
function preprocessShortOptions(argv: string[]): string[] {
  const result: string[] = [];
  for (const arg of argv) {
    const match = /^-([a-zA-Z])=(.+)$/.exec(arg);
    if (match) {
      result.push(`-${match[1]}`);
      result.push(match[2]);
    } else {
      result.push(arg);
    }
  }
  return result;
}

const argv = preprocessShortOptions(stripLanguageFlag(process.argv));

// An invalid --lang or MDCLI_LANG is an error, never a silent fallback.
const refusedLanguage = refusedLanguageValue();
if (refusedLanguage !== undefined) {
  console.error(
    `✗ ${
      refusedLanguage === ''
        ? t('missingLanguageValue', acceptedLanguages())
        : t('invalidLanguageValue', refusedLanguage, acceptedLanguages())
    }`,
  );
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(`✗ ${t('unexpectedError', message)}`);
  process.exit(1);
});

// Runs alongside the command; never blocks it for longer than the check timeout.
// Skipped for `mdcli update`, which does the same work in the foreground.
const updateCheck = argv[2] === 'update' ? Promise.resolve() : checkForUpdate({ packageRoot });

await program.parseAsync(argv);
await updateCheck;
