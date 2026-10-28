import { join } from 'node:path';
import { Command } from 'commander';
import { t } from './lib/i18n/index.js';
import { applyCommanderLocalization } from './lib/i18n/commander.js';
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
  .description(t('programDescription'))
  .version(pkg.version, '-V, --version', t('versionOptionDescription'))
  // Read and stripped from argv before commander parses it (src/lib/i18n/index.ts),
  // and declared here so it shows up in the help.
  .option('--lang <code>', t('langOptionDescription'))
  .helpOption('-h, --help', t('helpOptionDescription'));

program.addCommand(authCommand);
program.addCommand(categoriesCommand);
program.addCommand(accountsCommand);
program.addCommand(tagsCommand);
program.addCommand(entriesCommand);
program.addCommand(cardsCommand);
program.addCommand(syncCommand);

program
  .command('update')
  .description(t('updateCommandDescription'))
  .action(async () => {
    process.exitCode = await runManualUpdate({ packageRoot });
  });

applyCommanderLocalization(program);
