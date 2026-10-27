import { join } from 'node:path';
import { Command } from 'commander';
import { authCommand } from './commands/auth/index.js';
import { accountsCommand } from './commands/accounts/index.js';
import { categoriesCommand } from './commands/categories.js';
import { tagsCommand } from './commands/tags.js';
import { entriesCommand } from './commands/entries/index.js';
import { cardsCommand } from './commands/cards.js';
import { syncCommand } from './commands/sync/index.js';
import pkg from '../package.json' with { type: 'json' };
import { runManualUpdate } from './lib/self-update.js';

/** The installed package: package.json and the global install live here. */
export const packageRoot = join(import.meta.dir, '..');

/** The whole command tree, without parsing argv: bin/cli.ts runs it, and test/readme-commands.test.ts walks it. */
export const program = new Command();

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

program
  .command('update')
  .description('Update a global install to the latest release now')
  .action(async () => {
    process.exitCode = await runManualUpdate({ packageRoot });
  });
