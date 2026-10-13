#!/usr/bin/env bun

import { join } from 'node:path';
import { Command } from 'commander';
import { authCommand } from '../src/commands/auth.js';
import { accountsCommand } from '../src/commands/accounts.js';
import { categoriesCommand } from '../src/commands/categories.js';
import { tagsCommand } from '../src/commands/tags.js';
import { entriesCommand } from '../src/commands/entries.js';
import { cardsCommand } from '../src/commands/cards.js';
import pkg from '../package.json' with { type: 'json' };
import { checkForUpdate } from '../src/lib/self-update.js';

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

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(`✗ Unexpected error: ${message}`);
  process.exit(1);
});

// Runs alongside the command; never blocks it for longer than the check timeout.
const updateCheck = checkForUpdate({ packageRoot: join(import.meta.dir, '..') });

await program.parseAsync();
await updateCheck;
