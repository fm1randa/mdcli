import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { fetchTags, normalizeTags, createTag, updateTag, deleteTag } from '../lib/api.js';
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

function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

interface CreateTagOptions {
  name: string;
  color?: string;
  json?: boolean;
}

async function createTagAction(options: CreateTagOptions): Promise<void> {
  try {
    const cor = (options.color ?? '808080').replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
      logger.error('Invalid color. Use a 6-digit hex code, e.g. #FF0000.');
      process.exit(1);
    }

    const response = await createTag({ nome: options.name, cor, status: true });

    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    logger.success(`Tag "${response.nome}" created successfully!`);
    console.log(`  ${chalk.gray('ID:')} ${response.id}`);
    console.log(`  ${chalk.gray('Color:')} ${formatColor('#' + response.cor)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

tagsCommand
  .command('create')
  .description('Create a new tag')
  .requiredOption('-n, --name <name>', 'Tag name')
  .option('-C, --color <hex>', 'Tag color as a hex code (e.g. #FF0000), defaults to gray')
  .option('--json', 'Output as JSON')
  .action(createTagAction);

interface UpdateTagOptions {
  name?: string;
  color?: string;
  active?: boolean;
  inactive?: boolean;
  json?: boolean;
}

async function updateTagAction(id: string, options: UpdateTagOptions): Promise<void> {
  try {
    const tagId = Number(id);
    if (Number.isNaN(tagId)) {
      logger.error('Invalid tag ID. Must be a number.');
      process.exit(1);
    }

    if (
      options.name === undefined &&
      options.color === undefined &&
      !options.active &&
      !options.inactive
    ) {
      logger.error('No changes specified. Use --name, --color, --active or --inactive.');
      process.exit(1);
    }

    if (options.active && options.inactive) {
      logger.error('Cannot use --active and --inactive together.');
      process.exit(1);
    }

    let cor: string | undefined;
    if (options.color !== undefined) {
      cor = options.color.replace(/^#/, '');
      if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
        logger.error('Invalid color. Use a 6-digit hex code, e.g. #FF0000.');
        process.exit(1);
      }
    }

    const existing = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
    if (!existing) {
      logger.error(`Tag ${tagId} not found.`);
      process.exit(1);
    }

    let status = existing.active;
    if (options.active) status = true;
    if (options.inactive) status = false;

    const response = await updateTag(tagId, {
      nome: options.name ?? existing.name,
      cor: cor ?? existing.color.replace(/^#/, ''),
      status,
    });

    if (options.json) {
      console.log(JSON.stringify(response, null, 2));
      return;
    }

    logger.success(`Tag "${response.nome}" updated successfully!`);
    console.log(`  ${chalk.gray('ID:')} ${response.id}`);
    console.log(`  ${chalk.gray('Color:')} ${formatColor('#' + response.cor)}`);
    console.log(`  ${chalk.gray('Active:')} ${response.status ? chalk.green('yes') : chalk.gray('no')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

tagsCommand
  .command('update <id>')
  .description('Update a tag (only the fields you pass are changed)')
  .option('-n, --name <name>', 'New tag name')
  .option('-C, --color <hex>', 'New tag color as a hex code (e.g. #FF0000)')
  .option('--active', 'Mark the tag as active')
  .option('--inactive', 'Mark the tag as inactive (archive)')
  .option('--json', 'Output as JSON')
  .action(updateTagAction);

interface DeleteTagOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteTagAction(id: string, options: DeleteTagOptions): Promise<void> {
  try {
    const tagId = Number(id);
    if (Number.isNaN(tagId)) {
      logger.error('Invalid tag ID. Must be a number.');
      process.exit(1);
    }

    if (!options.dangerouslySkipConfirmation) {
      const tag = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
      if (!tag) {
        logger.error(`Tag ${tagId} not found.`);
        process.exit(1);
      }

      const confirmed = await promptConfirmation(
        chalk.red(`Are you sure you want to delete tag "${tag.name}" (${tagId})? (y/N) `)
      );

      if (!confirmed) {
        logger.info('Deletion cancelled.');
        process.exit(0);
      }
    }

    await deleteTag(tagId);

    if (options.json) {
      console.log(JSON.stringify({ deleted: true, id: tagId }, null, 2));
      return;
    }

    logger.success(`Tag ${tagId} deleted successfully!`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exit(1);
  }
}

tagsCommand
  .command('delete <id>')
  .description('Delete a tag')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(deleteTagAction);

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
