import chalk from 'chalk';

export function formatCurrency(value: number): string {
  const formatted = Math.abs(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return value >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

export function formatSignedCurrency(value: number): string {
  const formatted = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return value >= 0 ? chalk.green(formatted) : chalk.red(formatted);
}

export function formatStatus(status: 'reconciled' | 'pending' | 'scheduled'): string {
  const statusConfig = {
    reconciled: { label: 'Reconciled', color: chalk.green },
    pending: { label: 'Pending', color: chalk.yellow },
    scheduled: { label: 'Scheduled', color: chalk.blue },
  };
  const config = statusConfig[status];
  return config.color(config.label);
}

export function formatType(type: 'expense' | 'income' | 'transfer'): string {
  const typeConfig = {
    expense: { label: 'Expense', color: chalk.red },
    income: { label: 'Income', color: chalk.green },
    transfer: { label: 'Transfer', color: chalk.cyan },
  };
  const config = typeConfig[type];
  return config.color(config.label);
}
