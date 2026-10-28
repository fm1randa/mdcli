import { Command } from 'commander';
import { action } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { listAction } from './list.js';
import { runAction } from './run.js';

export const syncCommand = new Command('sync')
  .description(t('syncManageDescription'));

syncCommand
  .command('list')
  .description(t('syncListDescription'))
  .option('--json', t('jsonOption'))
  .action(action(listAction));

syncCommand
  .command('run')
  .description(t('syncRunDescription'))
  .argument('<account>', t('syncRunAccountArgument'))
  .option('--yes', t('syncRunYesOption'))
  .option('--json', t('syncRunJsonOption'))
  .action(action(runAction));
