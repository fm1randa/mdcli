import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { fetchTags, normalizeTags } from '../lib/api.js';
import { addAlias, getAliases, removeAlias, updateAlias } from '../lib/aliases.js';

function formatColor(hex: string): string {
  return chalk.hex(hex)('██') + ' ' + hex;
}

function formatBoolean(value: boolean): string {
  return value ? chalk.green('✓') : chalk.gray('✗');
}

async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
  try {
    const response = await fetchTags();
    let tags = normalizeTags(response);

    if (options.active) {
      tags = tags.filter((t) => t.active);
    }

    if (options.json) {
      console.log(JSON.stringify(tags, null, 2));
      return;
    }

    const table = new Table({
      head: ['ID', 'Name', 'Color', 'Active'],
      style: { head: ['cyan'] },
    });

    for (const tag of tags) {
      table.push([
        tag.id.toString(),
        tag.name,
        formatColor(tag.color),
        formatBoolean(tag.active),
      ]);
    }

    logger.header(`Tags (${tags.length})`);
    console.log(table.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

export const tagsCommand = new Command('tags')
  .description('Manage tags');

tagsCommand
  .command('list')
  .description('List all tags')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active tags')
  .action(listAction);

const aliasCommand = tagsCommand
  .command('alias')
  .description('Manage tag aliases');

aliasCommand
  .command('add')
  .description('Add an alias for a tag')
  .requiredOption('--id <id>', 'Tag ID')
  .requiredOption('--name <name>', 'Alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = addAlias('tags', id, options.name);
    if (result.success) {
      logger.success(`Alias "${options.name}" added for tag ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to add alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('list')
  .description('List all tag aliases')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const aliases = getAliases('tags');
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
    logger.header(`Tag Aliases (${aliases.length})`);
    console.log(table.toString());
  });

aliasCommand
  .command('rm')
  .description('Remove a tag alias')
  .option('--id <id>', 'Tag ID')
  .option('--name <name>', 'Alias name')
  .action((options: { id?: string; name?: string }) => {
    const identifier = options.id ?? options.name;
    if (!identifier) {
      logger.error('Either --id or --name is required');
      process.exit(1);
    }
    const result = removeAlias('tags', identifier);
    if (result.success) {
      logger.success(`Alias removed`);
    } else {
      logger.error(result.error ?? 'Failed to remove alias');
      process.exit(1);
    }
  });

aliasCommand
  .command('update')
  .description('Update a tag alias')
  .requiredOption('--id <id>', 'Tag ID')
  .requiredOption('--name <name>', 'New alias name')
  .action((options: { id: string; name: string }) => {
    const id = Number(options.id);
    if (Number.isNaN(id)) {
      logger.error('Invalid ID. Must be a number.');
      process.exit(1);
    }
    const result = updateAlias('tags', id, options.name);
    if (result.success) {
      logger.success(`Alias updated to "${options.name}" for tag ${id}`);
    } else {
      logger.error(result.error ?? 'Failed to update alias');
      process.exit(1);
    }
  });
