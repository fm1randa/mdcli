#!/usr/bin/env bun

import { checkForUpdate } from '../src/lib/self-update.js';
import { packageRoot, program } from '../src/program.js';

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(`✗ Unexpected error: ${message}`);
  process.exit(1);
});

// Runs alongside the command; never blocks it for longer than the check timeout.
// Skipped for `mdcli update`, which does the same work in the foreground.
const updateCheck = process.argv[2] === 'update' ? Promise.resolve() : checkForUpdate({ packageRoot });

await program.parseAsync();
await updateCheck;
