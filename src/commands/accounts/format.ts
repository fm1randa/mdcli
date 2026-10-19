import chalk from 'chalk';

export function formatStatus(active: boolean, closed: boolean): string {
  if (closed) return chalk.red('Closed');
  return active ? chalk.green('Active') : chalk.gray('Inactive');
}
