#!/usr/bin/env bun

// Resolves the language before anything builds the command tree or a message,
// so --help and the first error already come out in the chosen language.
import '../src/lib/i18n/bootstrap.js';

import { checkForUpdate } from '../src/lib/self-update.js';
import { packageRoot, buildProgram } from '../src/program.js';
import { acceptedLanguages, refusedLanguageValue, stripLanguageFlag, t } from '../src/lib/i18n/index.js';

const argv = stripLanguageFlag(process.argv);

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

const program = await buildProgram(argv.slice(2));
await program.parseAsync(argv);
await updateCheck;
