import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { fetchCategories, normalizeCategories } from '../lib/api.js';
import { addAlias, getAliases, removeAlias, updateAlias } from '../lib/aliases.js';

function formatType(type: string): string {
  const colors: Record<string, typeof chalk.red> = {
    expense: chalk.red,
    income: chalk.green,
    transfer: chalk.blue,
  };
  return (colors[type] ?? chalk.white)(type);
}

function formatBoolean(value: boolean): string {
  return value ? chalk.green('✓') : chalk.gray('✗');
}

async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
  try {
    const response = await fetchCategories();
    let categories = normalizeCategories(response);

    if (options.active) {
      categories = categories.filter((c) => c.active);
    }

    if (options.json) {
      console.log(JSON.stringify(categories, null, 2));
      return;
    }

    const table = new Table({
      head: ['ID', 'Name', 'Type', 'Active', 'System'],
      style: { head: ['cyan'] },
    });

    for (const cat of categories) {
      table.push([
        cat.id.toString(),
        cat.name,
        formatType(cat.type),
        formatBoolean(cat.active),
        formatBoolean(cat.system),
      ]);
    }

    logger.header(`Categories (${categories.length})`);
    console.log(table.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

export const categoriesCommand = new Command('categories')
  .description('Manage categories');

categoriesCommand
  .command('list')
  .description('List all categories')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active categories')
  .action(listAction);

const aliasCommand = categoriesCommand
  .command('alias')
  .description('Manage category aliases');

aliasCommand
  .command('add')
  .description('Add an alias for a category')
  .requiredOption('--id <id>', 'Category ID')
  .requiredOption('--name <name>', 'Alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = addAlias('categories', id, options.name);
    if (result.success) {
      logger.success(`Alias "${options.name}" added for category ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to add alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('list')
  .description('List all category aliases')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const aliases = getAliases('categories');
    if (options.json) {
      console.log(JSON.stringify(aliases, null, 2));
      return;
    }
    if (aliases.length === 0) {
      logger.info('No aliases defined');
      return;
    }
    const table = new Table({
      head: ['ID', 'Alias'],
      style: { head: ['cyan'] },
    });
    for (const alias of aliases) {
      table.push([alias.id.toString(), alias.name]);
    }
    logger.header(`Category Aliases (${aliases.length})`);
    console.log(table.toString());
  });

aliasCommand
  .command('rm')
  .description('Remove a category alias')
  .option('--id <id>', 'Category ID')
  .option('--name <name>', 'Alias name')
  .action((options: { id?: string; name?: string }) => {
    const identifier = options.id ?? options.name;
    if (!identifier) {
      logger.error('Either --id or --name is required');
      process.exit(1);
    }
    const result = removeAlias('categories', identifier);
    if (result.success) {
      logger.success(`Alias removed`);
    } else {
      logger.error(result.error ?? 'Failed to remove alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('update')
  .description('Update a category alias')
  .requiredOption('--id <id>', 'Category ID')
  .requiredOption('--name <name>', 'New alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = updateAlias('categories', id, options.name);
    if (result.success) {
      logger.success(`Alias updated to "${options.name}" for category ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to update alias');
      process.exit(1);
    }
  });
