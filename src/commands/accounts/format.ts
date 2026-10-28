import chalk from 'chalk';
import { t } from '../../lib/i18n/index.js';

export function formatStatus(active: boolean, closed: boolean): string {
  if (closed) return chalk.red(t('statusClosed'));
  return active ? chalk.green(t('statusActive')) : chalk.gray(t('statusInactive'));
}
