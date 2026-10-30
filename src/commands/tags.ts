import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import { fetchTags, normalizeTags, createTag, updateTag, deleteTag } from '../lib/api.js';
import { buildAliasCommand } from '../lib/aliases.js';
import { t } from '../lib/i18n/index.js';
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
    head: [t('labelId'), t('labelName'), t('labelColor'), t('statusActive')],
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

  logger.header(t('tagsHeader', tags.length));
  console.log(table.toString());
}

export const tagsCommand = new Command('tags')
  .description(t('tagsManageDescription'));

tagsCommand
  .command('list')
  .description(t('tagsListDescription'))
  .option('--json', t('jsonOption'))
  .option('--active', t('tagsActiveOnlyOption'))
  .action(action(listAction));


interface CreateTagOptions {
  name: string;
  color?: string;
  json?: boolean;
}

async function createTagAction(options: CreateTagOptions): Promise<void> {
  const cor = (options.color ?? '808080').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
    exitWithError(t('errorInvalidColor'));
  }

  const response = await createTag({ nome: options.name, cor, status: true });

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  logger.success(t('tagCreated', response.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${response.id}`);
  console.log(`  ${chalk.gray(`${t('labelColor')}:`)} ${formatColor('#' + response.cor)}`);
}

tagsCommand
  .command('create')
  .description(t('tagsCreateDescription'))
  .requiredOption('-n, --name <name>', t('tagsCreateNameOption'))
  .option('-C, --color <hex>', t('tagsCreateColorOption'))
  .option('--json', t('jsonOption'))
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
    exitWithError(t('errorInvalidTagId'));
  }

  if (
    options.name === undefined &&
    options.color === undefined &&
    !options.active &&
    !options.inactive
  ) {
    exitWithError(t('errorTagNoChanges'));
  }

  if (options.active && options.inactive) {
    exitWithError(t('errorActiveInactiveTogether'));
  }

  let cor: string | undefined;
  if (options.color !== undefined) {
    cor = options.color.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cor)) {
      exitWithError(t('errorInvalidColor'));
    }
  }

  const existing = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
  if (!existing) {
    exitWithError(t('errorTagNotFound', tagId));
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

  logger.success(t('tagUpdated', response.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${response.id}`);
  console.log(`  ${chalk.gray(`${t('labelColor')}:`)} ${formatColor('#' + response.cor)}`);
  console.log(`  ${chalk.gray(`${t('statusActive')}:`)} ${response.status ? chalk.green(t('yes')) : chalk.gray(t('no'))}`);
}

tagsCommand
  .command('update <id>')
  .description(t('tagsUpdateDescription'))
  .option('-n, --name <name>', t('tagsUpdateNameOption'))
  .option('-C, --color <hex>', t('tagsUpdateColorOption'))
  .option('--active', t('tagsUpdateActiveOption'))
  .option('--inactive', t('tagsUpdateInactiveOption'))
  .option('--json', t('jsonOption'))
  .action(action(updateTagAction));

interface DeleteTagOptions {
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteTagAction(id: string, options: DeleteTagOptions): Promise<void> {
  const tagId = parseId(id);
  if (tagId === undefined) {
    exitWithError(t('errorInvalidTagId'));
  }

  if (!options.dangerouslySkipConfirmation) {
    const tag = normalizeTags(await fetchTags()).find((t) => t.id === tagId);
    if (!tag) {
      exitWithError(t('errorTagNotFound', tagId));
    }

    const confirmed = await promptConfirmation(
      chalk.red(t('confirmDeleteTag', tag.name, tagId))
    );

    if (!confirmed) {
      logger.info(t('deletionCancelled'));
      process.exit(0);
    }
  }

  await deleteTag(tagId);

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: tagId }, null, 2));
    return;
  }

  logger.success(t('tagDeleted', tagId));
}

tagsCommand
  .command('delete <id>')
  .description(t('tagsDeleteDescription'))
  .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
  .option('--json', t('jsonOption'))
  .action(action(deleteTagAction));

buildAliasCommand(tagsCommand, 'tags');
