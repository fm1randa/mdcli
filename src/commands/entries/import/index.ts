import { Command } from 'commander';
import { action } from '../../../utils/action.js';
import { t } from '../../../lib/i18n/index.js';
import { listAction } from './list.js';
import { runAction } from './run.js';

export const importCommand = new Command('import')
  .description(t('importCommandDescription'));

importCommand
  .command('list')
  .description(t('importListDescription'))
  .requiredOption('-a, --account <identifier>', t('importAccountOption'))
  .option('--since <date>', t('importSinceHelp'))
  .option('--search-from <date>', t('importSearchFromHelp'))
  .option('--search-to <date>', t('importSearchToHelp'))
  .option('--json', t('jsonOption'))
  .addHelpText('after', t('importNotes'))
  .action(action(listAction));

importCommand
  .command('run')
  .description(t('importRunDescription'))
  .requiredOption('-a, --account <identifier>', t('importAccountOption'))
  .option('--ids <prefixes>', t('importIdsOption'))
  .option('-c, --category <identifier>', t('importCategoryOption'))
  .option('--reject <prefixes>', t('importRejectOption'))
  .option('--plan <file>', t('importPlanOption'))
  .option('--edit', t('importEditOption'))
  .option('--include-duplicates', t('importIncludeDuplicatesOption'))
  .option('--since <date>', t('importSinceHelp'))
  .option('--search-from <date>', t('importSearchFromHelp'))
  .option('--search-to <date>', t('importSearchToHelp'))
  .option('--dry-run', t('importDryRunOption'))
  .option('--yes', t('importYesOption'))
  .option('--json', t('importJsonOption'))
  .addHelpText('after', t('importNotes'))
  .action(action(runAction));
