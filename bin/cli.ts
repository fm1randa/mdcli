#!/usr/bin/env bun

import { Command } from 'commander';
import { authCommand } from '../src/commands/auth.js';
import { accountsCommand } from '../src/commands/accounts.js';
import { categoriesCommand } from '../src/commands/categories.js';
import { tagsCommand } from '../src/commands/tags.js';
import { entriesCommand } from '../src/commands/entries.js';
import { cardsCommand } from '../src/commands/cards.js';

const program = new Command();

program
  .name('mdcli')
  .description('Unofficial CLI client for Meu Dinheiro (meudinheiroweb.com.br)')
  .version('1.0.0');

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

await program.parseAsync();
