import { join } from 'node:path';
import { Command } from 'commander';
import { t } from './lib/i18n/index.js';
import { applyCommanderLocalization } from './lib/i18n/commander.js';
import pkg from '../package.json' with { type: 'json' };
import { runManualUpdate } from './lib/self-update.js';

/** The installed package: package.json and the global install live here. */
export const packageRoot = join(import.meta.dir, '..');

type CommandLoader = () => Promise<Command>;

/**
 * The command modules, in the order the help lists them. Each one is imported
 * only when it is the command being run: `mdcli accounts list` never pays for
 * the browser auth, cards or sync modules it does not touch.
 */
const COMMANDS: ReadonlyArray<readonly [name: string, load: CommandLoader]> = [
  ['auth', async () => (await import('./commands/auth/index.js')).authCommand],
  ['categories', async () => (await import('./commands/categories.js')).categoriesCommand],
  ['accounts', async () => (await import('./commands/accounts/index.js')).accountsCommand],
  ['tags', async () => (await import('./commands/tags.js')).tagsCommand],
  ['entries', async () => (await import('./commands/entries/index.js')).entriesCommand],
  ['cards', async () => (await import('./commands/cards.js')).cardsCommand],
  ['sync', async () => (await import('./commands/sync/index.js')).syncCommand],
];

/** The program's own options and description, without any command. */
function baseProgram(): Command {
  return new Command()
    .name('mdcli')
    .description(t('programDescription'))
    .version(pkg.version, '-V, --version', t('versionOptionDescription'))
    // Read and stripped from argv before commander parses it (src/lib/i18n/index.ts),
    // and declared here so it shows up in the help.
    .option('--lang <code>', t('langOptionDescription'))
    .helpOption('-h, --help', t('helpOptionDescription'));
}

function addUpdateCommand(program: Command): void {
  program
    .command('update')
    .description(t('updateCommandDescription'))
    .action(async () => {
      process.exitCode = await runManualUpdate({ packageRoot });
    });
}

/** The first token that is not a flag, i.e. the command to run (if any). */
function firstPositional(argv: readonly string[]): string | undefined {
  for (const arg of argv) {
    if (arg === '--') break;
    if (!arg.startsWith('-')) return arg;
  }
  return undefined;
}

/**
 * The command tree for `argv`. Only the command being run is imported. The
 * whole tree is imported for --help and for anything that is not a known
 * command, so commander can list the commands or suggest the closest one.
 */
export async function buildProgram(argv: readonly string[] = []): Promise<Command> {
  const program = baseProgram();
  const name = firstPositional(argv);
  const versionOnly = argv.includes('--version') || argv.includes('-V');
  const wanted = COMMANDS.find(([commandName]) => commandName === name);

  if (name === 'update') {
    addUpdateCommand(program);
  } else if (wanted) {
    program.addCommand(await wanted[1]());
  } else if (!versionOnly) {
    for (const [, load] of COMMANDS) program.addCommand(await load());
    addUpdateCommand(program);
  }

  applyCommanderLocalization(program);
  return program;
}
