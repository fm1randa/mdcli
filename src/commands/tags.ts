import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import { fetchTags, normalizeTags, createTag, updateTag, deleteTag } from '../lib/api.js';
import { buildAliasCommand } from '../lib/aliases.js';
import { parseId } from '../utils/parse.js';

function formatColor(hex: string): string {
  return chalk.hex(hex)('██') + ' ' + hex;
}

function formatBoolean(value: boolean): string {
  return value ? chalk.green('✓') : chalk.gray('✗');
}

async function listAction(options: { json?: boolean; active?: boolean }): Promise<void> {
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
}

export const tagsCommand = new Command('tags')
  .description('Manage tags');

tagsCommand
  .command('list')
  .description('List all tags')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active tags')
  .action(action(listAction));


interface CreateTagOptions {
  name: string;
  color?: string;
  json?: boolean;
}

async function createTagAction(options: CreateTagOptions): Promise<void> {
  const cor = (options.color ?? '808080').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
    exitWithError('Invalid color. Use a 6-digit hex code, e.g. #FF0000.');
  }

  const response = await createTag({ nome: options.name, cor, status: true });

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  logger.success(`Tag "${response.nome}" created successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${response.id}`);
  console.log(`  ${chalk.gray('Color:')} ${formatColor('#' + response.cor)}`);
}

tagsCommand
  .command('create')
  .description('Create a new tag')
  .requiredOption('-n, --name <name>', 'Tag name')
  .option('-C, --color <hex>', 'Tag color as a hex code (e.g. #FF0000), defaults to gray')
  .option('--json', 'Output as JSON')
  .action(action(createTagAction));

interface UpdateTagOptions {
  name?: string;
  color?: string;
  active?: boolean;
  inactive?: boolean;
  json?: boolean;
}

async function updateTagAction(id: string, options: UpdateTagOptions): Promise<void> {
  const tagId = parseId(id);
  if (tagId === undefined) {
    exitWithError('Invalid tag ID. Must be a number.');
  }

  if (
    options.name === undefined &&
    options.color === undefined &&
    !options.active &&
    !options.inactive
  ) {
    exitWithError('No changes specified. Use --name, --color, --active or --inactive.');
  }

  if (options.active && options.inactive) {
    exitWithError('Cannot use --active and --inactive together.');
  }

  let cor: string | undefined;
  if (options.color !== undefined) {
    cor = options.color.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
      exitWithError('Invalid color. Use a 6-digit hex code, e.g. #FF0000.');
    }
  }

  const existing = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
  if (!existing) {
    exitWithError(`Tag ${tagId} not found.`);
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
}

tagsCommand
  .command('update <id>')
  .description('Update a tag (only the fields you pass are changed)')
  .option('-n, --name <name>', 'New tag name')
  .option('-C, --color <hex>', 'New tag color as a hex code (e.g. #FF0000)')
  .option('--active', 'Mark the tag as active')
  .option('--inactive', 'Mark the tag as inactive (archive)')
  .option('--json', 'Output as JSON')
  .action(action(updateTagAction));

interface DeleteTagOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteTagAction(id: string, options: DeleteTagOptions): Promise<void> {
  const tagId = parseId(id);
  if (tagId === undefined) {
    exitWithError('Invalid tag ID. Must be a number.');
  }

  if (!options.dangerouslySkipConfirmation) {
    const tag = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
    if (!tag) {
      exitWithError(`Tag ${tagId} not found.`);
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
}

tagsCommand
  .command('delete <id>')
  .description('Delete a tag')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(action(deleteTagAction));

buildAliasCommand(tagsCommand, 'tags');
