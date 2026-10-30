#!/usr/bin/env bun

// Resolves the language before anything builds the command tree or a message,
// so --help and the first error already come out in the chosen language.
import '../src/lib/i18n/bootstrap.js';

import { checkForUpdate } from '../src/lib/self-update.js';
import { Command } from 'commander';
import { packageRoot, program } from '../src/program.js';
import { acceptedLanguages, refusedLanguageValue, stripLanguageFlag, t } from '../src/lib/i18n/index.js';

/** The short and long flags that take a value, read from the command tree so
  new options are covered without a second list. */
interface ValueFlags {
  short: Set<string>;
  long: Set<string>;
}

function collectValueFlags(cmd: Command, flags: ValueFlags = { short: new Set(), long: new Set() }): ValueFlags {
  for (const opt of cmd.options ?? []) {
    if (!(opt.required || opt.optional)) continue;
    const short = opt.short?.replace(/^-/, '');
    if (short && short.length === 1) flags.short.add(short);
    if (opt.long) flags.long.add(opt.long);
  }
  for (const sub of cmd.commands ?? []) collectValueFlags(sub, flags);
  return flags;
}

const valueFlags = collectValueFlags(program);

/** Commander treats `=` as a separator only for long options, so `-v=46.33`
  reaches a short option as `=46.33`. Split it before any command parser runs. */
function preprocessShortOptions(argv: string[]): string[] {
  const result: string[] = [];
  let afterDashDash = false;
  let expectingValue = false;
  for (const arg of argv) {
    if (afterDashDash) {
      result.push(arg);
      expectingValue = false;
      continue;
    }
    if (arg === '--') {
      afterDashDash = true;
      result.push(arg);
      expectingValue = false;
      continue;
    }
    // If the previous option expects a value, this argument is its value.
    if (expectingValue) {
      result.push(arg);
      expectingValue = false;
      continue;
    }
    // Only a value-taking option consumes the next argument. A boolean long
    // flag such as --json must leave the next token to the short-option split.
    const shortOption = /^-([a-zA-Z])$/.exec(arg);
    if (shortOption && valueFlags.short.has(shortOption[1])) {
      result.push(arg);
      expectingValue = true;
      continue;
    }
    const longOption = /^(--[a-zA-Z][a-zA-Z0-9-]*)$/.exec(arg);
    if (longOption) {
      result.push(arg);
      expectingValue = valueFlags.long.has(longOption[1]);
      continue;
    }
    const longWithValue = /^--[a-zA-Z][a-zA-Z0-9-]*=/.test(arg);
    if (longWithValue) {
      result.push(arg);
      expectingValue = false;
      continue;
    }
    // Split a short option with inline value only when it is a known
    // value-taking flag and is not being provided as a previous option's value.
    const match = /^-([a-zA-Z])=(.+)$/.exec(arg);
    if (match && valueFlags.short.has(match[1])) {
      result.push(`-${match[1]}`);
      result.push(match[2]);
    } else {
      result.push(arg);
    }
    expectingValue = false;
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
