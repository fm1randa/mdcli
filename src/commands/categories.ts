import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { action, exitWithError } from '../utils/action.js';
import { promptConfirmation } from '../utils/prompt.js';
import {
  fetchCategories,
  normalizeCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../lib/api.js';
import { buildAliasCommand, resolveId } from '../lib/aliases.js';
import { invalidateNameCache } from '../lib/config.js';
import type { Category } from '../types/index.js';
import { parseId } from '../utils/parse.js';

const TYPE_CODES = { expense: 'd', income: 'r', transfer: 't' } as const;
type CategoryTypeName = keyof typeof TYPE_CODES;

function parseTypeName(input: string): CategoryTypeName | null {
  const normalized = input.toLowerCase();
  return normalized in TYPE_CODES ? (normalized as CategoryTypeName) : null;
}


async function resolveCategory(input: string, categories: Category[]): Promise<Category> {
  const id = await resolveId('categories', input);
  const category = id === null ? undefined : categories.find((c) => c.id === id);
  if (!category) {
    exitWithError(`Category "${input}" not found. See: mdcli categories list`);
  }
  return category;
}


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

async function listAction(options: { json?: boolean; active?: boolean; type?: string }): Promise<void> {
  const typeFilter = options.type === undefined ? undefined : parseTypeName(options.type);
  if (typeFilter === null) {
    exitWithError(`Invalid type "${options.type}". Use expense, income, or transfer.`);
  }

  const response = await fetchCategories();
  let categories = normalizeCategories(response);

  if (options.active) {
    categories = categories.filter((c) => c.active);
  }

  if (typeFilter) {
    categories = categories.filter((c) => c.type === typeFilter);
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
}

export const categoriesCommand = new Command('categories')
  .description('Manage categories');

categoriesCommand
  .command('list')
  .description('List all categories')
  .option('--json', 'Output as JSON')
  .option('--active', 'Show only active categories')
  .option('-t, --type <type>', 'Show only one type: expense, income, or transfer')
  .action(action(listAction));

interface CreateCategoryOptions {
  name: string;
  type?: string;
  parent?: string;
  json?: boolean;
}

async function createCategoryAction(options: CreateCategoryOptions): Promise<void> {
  if (!options.type && !options.parent) {
    exitWithError('Use --type (expense or income) for a top-level category, or --parent for a subcategory.');
  }

  let tipo: 'd' | 'r' | undefined;
  if (options.type) {
    const typeName = parseTypeName(options.type);
    if (typeName !== 'expense' && typeName !== 'income') {
      exitWithError(`Invalid type "${options.type}". Use expense or income.`);
    }
    tipo = TYPE_CODES[typeName];
  }

  let parent: Category | undefined;
  if (options.parent) {
    parent = await resolveCategory(options.parent, (await fetchCategories()).items);
    if (parent.tipo === 't') {
      exitWithError('Transfer categories cannot have subcategories.');
    }
    if (tipo && tipo !== parent.tipo) {
      exitWithError(`--type doesn't match the parent category's type.`);
    }
    tipo = parent.tipo;
  }

  if (!tipo) {
    exitWithError('Could not determine the category type.');
  }

  const category = await createCategory({
    nome: options.name,
    nomeRel: '',
    tipo,
    pai: parent ? String(parent.id) : 0,
  });
  invalidateNameCache('categories');

  if (options.json) {
    console.log(JSON.stringify(category, null, 2));
    return;
  }

  logger.success(`Category "${category.nome}" created successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${category.id}`);
}

categoriesCommand
  .command('create')
  .description('Create a category or, with --parent, a subcategory')
  .requiredOption('-n, --name <name>', 'Category name')
  .option('-t, --type <type>', 'expense or income (inherited from --parent when omitted)')
  .option('-p, --parent <category>', 'Parent category (ID, alias, or name)')
  .option('--json', 'Output as JSON')
  .action(action(createCategoryAction));

interface UpdateCategoryOptions {
  name?: string;
  active?: boolean;
  inactive?: boolean;
  json?: boolean;
}

async function updateCategoryAction(id: string, options: UpdateCategoryOptions): Promise<void> {
  const categoryId = parseId(id);
  if (categoryId === undefined) {
    exitWithError('Invalid category ID. Must be a number.');
  }
  if (options.name === undefined && !options.active && !options.inactive) {
    exitWithError('No changes specified. Use --name, --active or --inactive.');
  }
  if (options.active && options.inactive) {
    exitWithError('Cannot use --active and --inactive together.');
  }

  const existing = (await fetchCategories()).items.find((c) => c.id === categoryId);
  if (!existing) {
    exitWithError(`Category ${categoryId} not found.`);
  }
  if (!existing.permissoes.acoes.editar) {
    exitWithError(`Category "${existing.nome}" can't be edited (system category).`);
  }

  let status = existing.status;
  if (options.active) status = true;
  if (options.inactive) status = false;

  // For subcategories `nome` holds the full "Parent/Child" path; the API
  // expects just the leaf name, which is what `nomeRel` carries.
  const category = await updateCategory(categoryId, {
    ...existing,
    nome: options.name ?? existing.nomeRel,
    pai: existing.pai ?? 0,
    status,
  });
  invalidateNameCache('categories');

  if (options.json) {
    console.log(JSON.stringify(category, null, 2));
    return;
  }

  logger.success(`Category "${category.nome}" updated successfully!`);
  console.log(`  ${chalk.gray('ID:')} ${category.id}`);
  console.log(`  ${chalk.gray('Active:')} ${category.status ? chalk.green('yes') : chalk.gray('no')}`);
}

categoriesCommand
  .command('update <id>')
  .description('Update a category (only the fields you pass are changed)')
  .option('-n, --name <name>', 'New category name')
  .option('--active', 'Mark the category as active')
  .option('--inactive', 'Mark the category as inactive (archive)')
  .option('--json', 'Output as JSON')
  .action(action(updateCategoryAction));

interface DeleteCategoryOptions {
  moveTo: string;
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteCategoryAction(id: string, options: DeleteCategoryOptions): Promise<void> {
  const categoryId = parseId(id);
  if (categoryId === undefined) {
    exitWithError('Invalid category ID. Must be a number.');
  }

  const categories = (await fetchCategories()).items;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    exitWithError(`Category ${categoryId} not found.`);
  }
  if (!category.permissoes.acoes.excluir) {
    exitWithError(`Category "${category.nome}" can't be deleted (system category).`);
  }
  if (categories.some((c) => c.pai === categoryId)) {
    exitWithError(`Category "${category.nome}" has subcategories. Delete or move them first.`);
  }

  const destination = await resolveCategory(options.moveTo, categories);
  if (destination.id === categoryId) {
    exitWithError('--move-to must be a different category.');
  }
  if (destination.tipo !== category.tipo) {
    exitWithError(`--move-to must be the same type as "${category.nome}".`);
  }

  if (!options.dangerouslySkipConfirmation) {
    const confirmed = await promptConfirmation(
      chalk.red(
        `Delete category "${category.nome}" (${categoryId}) and move its entries to "${destination.nome}"? (y/N) `
      )
    );
    if (!confirmed) {
      logger.info('Deletion cancelled.');
      return;
    }
  }

  await deleteCategory(categoryId, destination.id);
  invalidateNameCache('categories');

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: categoryId, movedTo: destination.id }, null, 2));
    return;
  }

  logger.success(`Category ${categoryId} deleted; its entries now belong to "${destination.nome}".`);
}

categoriesCommand
  .command('delete <id>')
  .description('Delete a category, moving its entries to another category')
  .requiredOption('--move-to <category>', 'Category (ID, alias, or name) that receives the entries')
  .option('--dangerously-skip-confirmation', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(action(deleteCategoryAction));

buildAliasCommand(categoriesCommand, 'categories');
