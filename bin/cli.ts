#!/usr/bin/env bun

// Resolves the language before anything builds the command tree or a message,
// so --help and the first error already come out in the chosen language.
import '../src/lib/i18n/bootstrap.js';

import { checkForUpdate } from '../src/lib/self-update.js';
import { Command } from 'commander';
import { packageRoot, buildProgram } from '../src/program.js';
import { flushStdout } from '../src/utils/action.js';
import { acceptedLanguages, refusedLanguageValue, stripLanguageFlag, t } from '../src/lib/i18n/index.js';

/** The short flags that take a value, read from the command tree so new
  options are covered without a second list. */
function collectShortValueFlags(cmd: Command, flags: Set<string> = new Set()): Set<string> {
  for (const opt of cmd.options ?? []) {
    if (!(opt.required || opt.optional)) continue;
    const short = opt.short?.replace(/^-/, '');
    if (short && short.length === 1) flags.add(short);
  }
  for (const sub of cmd.commands ?? []) collectShortValueFlags(sub, flags);
  return flags;
}

/** Commander treats `=` as a separator only for long options, so `-v=46.33`
  reaches a short option as `=46.33`. Split it before any command parser runs.
  Only a token that looks like `-x=value` with a value-taking `x` is touched;
  long options, boolean flags and positional arguments pass through unchanged.
  Never track a "previous option expects a value": a short flag such as `-r`
  is value-taking in one command (`--repeat`) and boolean in another
  (`--reconciled`), so a global flag set cannot decide, and a token that looks
  like `-x=value` is never a legitimate option value here. */
function preprocessShortOptions(argv: string[], valueFlags: ReadonlySet<string>): string[] {
  const result: string[] = [];
  let afterDashDash = false;
  for (const arg of argv) {
    if (afterDashDash) {
      result.push(arg);
      continue;
    }
    if (arg === '--') {
      afterDashDash = true;
      result.push(arg);
      continue;
    }
    const match = /^-([a-zA-Z])=(.+)$/.exec(arg);
    if (match && valueFlags.has(match[1])) {
      result.push(`-${match[1]}`);
      result.push(match[2]);
    } else {
      result.push(arg);
    }
  }
  return result;
}

const rawArgv = stripLanguageFlag(process.argv);

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
  await flushStdout(3000);
  // eslint-disable-next-line local/no-bare-process-exit
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(`✗ ${t('unexpectedError', message)}`);
  flushStdout(3000)
    // eslint-disable-next-line local/no-bare-process-exit
    .then(() => process.exit(1))
    // eslint-disable-next-line local/no-bare-process-exit
    .catch(() => process.exit(1));
});

// Runs alongside the command; never blocks it for longer than the check timeout.
// Skipped for `mdcli update`, which does the same work in the foreground.
const updateCheck = rawArgv[2] === 'update' ? Promise.resolve() : checkForUpdate({ packageRoot });

const program = await buildProgram(rawArgv.slice(2));
const argv = preprocessShortOptions(rawArgv, collectShortValueFlags(program));
await program.parseAsync(argv);
await updateCheck;
await flushStdout();
