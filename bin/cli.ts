#!/usr/bin/env bun

// Resolves the language before anything builds the command tree or a message,
// so --help and the first error already come out in the chosen language.
import '../src/lib/i18n/bootstrap.js';

import { checkForUpdate } from '../src/lib/self-update.js';
import { Command } from 'commander';
import { packageRoot, program } from '../src/program.js';
import { acceptedLanguages, refusedLanguageValue, stripLanguageFlag, t } from '../src/lib/i18n/index.js';

/** Preprocess argv so short options with `=` (`-v=46.33`) work: commander
  treats `=` as a separator only for long options, so `-v=46.33` arrives
  as value `=46.33`. We split it centrally for every command and option. */
function collectValueShortFlags(cmd: Command): Set<string> {
  const flags = new Set<string>();
  for (const opt of cmd.options || []) {
    if ((opt.required || opt.optional) && opt.short) {
      const short = (opt.short || '').match(/^-([a-z])/)?.[1] ?? '';
      if (short.length === 1) flags.add(short);
    }
  }
  for (const sub of cmd.commands || []) {
    for (const f of collectValueShortFlags(sub)) flags.add(f);
  }
  return flags;
}

const knownShortFlags = collectValueShortFlags(program);

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
    // Detect a known value option expecting the next argument as value.
    const shortOption = /^-([a-z])$/.exec(arg);
    if (shortOption && knownShortFlags.has(shortOption[1])) {
      result.push(arg);
      expectingValue = true;
      continue;
    }
    const longOption = /^--([a-zA-Z][a-zA-Z0-9-]*)$/.exec(arg);
    if (longOption) {
      result.push(arg);
      expectingValue = true;
      continue;
    }
    const longWithValue = /^--[a-zA-Z][a-zA-Z0-9-]*=.*$/.exec(arg);
    if (longWithValue) {
      result.push(arg);
      expectingValue = false;
      continue;
    }
    // Split a short option with inline value only when it is a known
    // value-taking flag and is not being provided as a previous option's value.
    const match = /^-([a-z])=(.+)$/.exec(arg);
    if (match && knownShortFlags.has(match[1])) {
      result.push(`-${match[1]}`);
      result.push(match[2]);
      expectingValue = false;
    } else {
      result.push(arg);
      expectingValue = false;
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
