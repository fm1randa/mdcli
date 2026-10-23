#!/usr/bin/env bun

import { join } from 'node:path';
import { Command } from 'commander';
import { authCommand } from '../src/commands/auth/index.js';
import { accountsCommand } from '../src/commands/accounts/index.js';
import { categoriesCommand } from '../src/commands/categories.js';
import { tagsCommand } from '../src/commands/tags.js';
import { entriesCommand } from '../src/commands/entries/index.js';
import { cardsCommand } from '../src/commands/cards.js';
import { syncCommand } from '../src/commands/sync/index.js';
import pkg from '../package.json' with { type: 'json' };
import { checkForUpdate, runManualUpdate } from '../src/lib/self-update.js';

const program = new Command();

program
  .name('mdcli')
  .description('Unofficial CLI client for Meu Dinheiro (meudinheiroweb.com.br)')
  .version(pkg.version);

program.addCommand(authCommand);
program.addCommand(categoriesCommand);
program.addCommand(accountsCommand);
program.addCommand(tagsCommand);
program.addCommand(entriesCommand);
program.addCommand(cardsCommand);
program.addCommand(syncCommand);

const packageRoot = join(import.meta.dir, '..');

program
  .command('update')
  .description('Update a global install to the latest release now')
  .action(async () => {
    process.exitCode = await runManualUpdate({ packageRoot });
  });

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
