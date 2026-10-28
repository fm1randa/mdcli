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
import { t } from '../lib/i18n/index.js';
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
    exitWithError(t('errorCategoryNotFound', input));
  }
  return category;
}


function formatType(type: string): string {
  const colors: Record<string, typeof chalk.red> = {
    expense: chalk.red,
    income: chalk.green,
    transfer: chalk.blue,
  };
  const labels: Record<string, () => string> = {
    expense: () => t('typeExpense'),
    income: () => t('typeIncome'),
    transfer: () => t('typeTransfer'),
  };
  return (colors[type] ?? chalk.white)(labels[type]?.() ?? type);
}

function formatBoolean(value: boolean): string {
  return value ? chalk.green('✓') : chalk.gray('✗');
}

async function listAction(options: { json?: boolean; active?: boolean; type?: string }): Promise<void> {
  let typeFilter: CategoryTypeName | undefined;
  if (options.type !== undefined) {
    const parsed = parseTypeName(options.type);
    if (parsed === null) {
      exitWithError(t('errorInvalidCategoryType', options.type));
    }
    typeFilter = parsed;
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
    head: [t('labelId'), t('labelName'), t('labelType'), t('labelActive'), t('labelSystem')],
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

  logger.header(t('categoriesHeader', categories.length));
  console.log(table.toString());
}

export const categoriesCommand = new Command('categories')
  .description(t('categoriesManageDescription'));

categoriesCommand
  .command('list')
  .description(t('categoriesListDescription'))
  .option('--json', t('jsonOption'))
  .option('--active', t('categoriesActiveOnlyOption'))
  .option('-t, --type <type>', t('categoriesListTypeOption'))
  .action(action(listAction));

interface CreateCategoryOptions {
  name: string;
  type?: string;
  parent?: string;
  json?: boolean;
}

async function createCategoryAction(options: CreateCategoryOptions): Promise<void> {
  if (!options.type && !options.parent) {
    exitWithError(t('errorCategoryTypeRequired'));
  }

  let tipo: 'd' | 'r' | undefined;
  if (options.type) {
    const typeName = parseTypeName(options.type);
    if (typeName !== 'expense' && typeName !== 'income') {
      exitWithError(t('errorInvalidCategoryTypeParent', options.type));
    }
    tipo = TYPE_CODES[typeName];
  }

  let parent: Category | undefined;
  if (options.parent) {
    parent = await resolveCategory(options.parent, (await fetchCategories()).items);
    if (parent.tipo === 't') {
      exitWithError(t('errorTransferCategorySubcategory'));
    }
    if (tipo && tipo !== parent.tipo) {
      exitWithError(t('errorCategoryTypeMismatch'));
    }
    tipo = parent.tipo;
  }

  if (!tipo) {
    exitWithError(t('errorCategoryTypeUndetermined'));
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

  logger.success(t('categoryCreated', category.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${category.id}`);
}

categoriesCommand
  .command('create')
  .description(t('categoriesCreateDescription'))
  .requiredOption('-n, --name <name>', t('categoriesCreateNameOption'))
  .option('-t, --type <type>', t('categoriesCreateTypeOption'))
  .option('-p, --parent <category>', t('categoriesCreateParentOption'))
  .option('--json', t('jsonOption'))
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
    exitWithError(t('errorInvalidCategoryId'));
  }
  if (options.name === undefined && !options.active && !options.inactive) {
    exitWithError(t('errorCategoryNoChanges'));
  }
  if (options.active && options.inactive) {
    exitWithError(t('errorActiveInactiveTogether'));
  }

  const existing = (await fetchCategories()).items.find((c) => c.id === categoryId);
  if (!existing) {
    exitWithError(t('errorCategoryIdNotFound', categoryId));
  }
  if (!existing.permissoes.acoes.editar) {
    exitWithError(t('errorCategorySystemEdit', existing.nome));
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

  logger.success(t('categoryUpdated', category.nome));
  console.log(`  ${chalk.gray(`${t('labelId')}:`)} ${category.id}`);
  console.log(`  ${chalk.gray(`${t('labelActive')}:`)} ${category.status ? chalk.green(t('yes')) : chalk.gray(t('no'))}`);
}

categoriesCommand
  .command('update <id>')
  .description(t('categoriesUpdateDescription'))
  .option('-n, --name <name>', t('categoriesUpdateNameOption'))
  .option('--active', t('categoriesUpdateActiveOption'))
  .option('--inactive', t('categoriesUpdateInactiveOption'))
  .option('--json', t('jsonOption'))
  .action(action(updateCategoryAction));

interface DeleteCategoryOptions {
  moveTo: string;
  dangerouslySkipConfirmation?: boolean;
  json?: boolean;
}

async function deleteCategoryAction(id: string, options: DeleteCategoryOptions): Promise<void> {
  const categoryId = parseId(id);
  if (categoryId === undefined) {
    exitWithError(t('errorInvalidCategoryId'));
  }

  const categories = (await fetchCategories()).items;
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    exitWithError(t('errorCategoryIdNotFound', categoryId));
  }
  if (!category.permissoes.acoes.excluir) {
    exitWithError(t('errorCategorySystemDelete', category.nome));
  }
  if (categories.some((c) => c.pai === categoryId)) {
    exitWithError(t('errorCategoryHasChildren', category.nome));
  }

  const destination = await resolveCategory(options.moveTo, categories);
  if (destination.id === categoryId) {
    exitWithError(t('errorMoveToSameCategory'));
  }
  if (destination.tipo !== category.tipo) {
    exitWithError(t('errorMoveToSameType', category.nome));
  }

  if (!options.dangerouslySkipConfirmation) {
    const confirmed = await promptConfirmation(
      chalk.red(t('confirmDeleteCategory', category.nome, categoryId, destination.nome))
    );
    if (!confirmed) {
      logger.info(t('deletionCancelled'));
      return;
    }
  }

  await deleteCategory(categoryId, destination.id);
  invalidateNameCache('categories');

  if (options.json) {
    console.log(JSON.stringify({ deleted: true, id: categoryId, movedTo: destination.id }, null, 2));
    return;
  }

  logger.success(t('categoryDeleted', categoryId, destination.nome));
}

categoriesCommand
  .command('delete <id>')
  .description(t('categoriesDeleteDescription'))
  .requiredOption('--move-to <category>', t('categoriesDeleteMoveToOption'))
  .option('--dangerously-skip-confirmation', t('skipConfirmationOption'))
  .option('--json', t('jsonOption'))
  .action(action(deleteCategoryAction));

buildAliasCommand(categoriesCommand, 'categories');
