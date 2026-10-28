import { Command } from 'commander';
import Table from 'cli-table3';
import { getFullConfig, setAliases } from './config.js';
import { logger } from '../utils/logger.js';
import { exitWithError } from '../utils/action.js';
import { t } from './i18n/index.js';
import type { Alias, AliasMap, AliasType } from '../types/index.js';
import { parseId } from '../utils/parse.js';

function loadAliases(): AliasMap {
  const config = getFullConfig();
  return {
    accounts: config.aliases?.accounts ?? [],
    categories: config.aliases?.categories ?? [],
    tags: config.aliases?.tags ?? [],
  };
}

function saveAliases(aliases: AliasMap): void {
  setAliases(aliases);
}

export function getAliases(type: AliasType): Alias[] {
  return loadAliases()[type];
}

export function addAlias(type: AliasType, id: number, name: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const nameExists = list.some((a) => a.name === name);
  if (nameExists) {
    return { success: false, error: t('errorAliasExists', name) };
  }

  const existingForId = list.find((a) => a.id === id);
  if (existingForId) {
    return { success: false, error: t('errorAliasIdExists', id, existingForId.name) };
  }

  list.push({ id, name });
  saveAliases(aliases);
  return { success: true };
}

export function updateAlias(type: AliasType, id: number, newName: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const index = list.findIndex((a) => a.id === id);
  if (index === -1) {
    return { success: false, error: t('errorAliasNotFoundForId', id) };
  }

  const nameConflicts = list.some((a, i) => i !== index && a.name === newName);
  if (nameConflicts) {
    return { success: false, error: t('errorAliasExists', newName) };
  }

  list[index].name = newName;
  saveAliases(aliases);
  return { success: true };
}

export function removeAlias(type: AliasType, identifier: string): { success: boolean; error?: string } {
  const aliases = loadAliases();
  const list = aliases[type];

  const numId = parseId(identifier);
  let index = numId !== undefined ? list.findIndex((a) => a.id === numId) : -1;

  if (index === -1) {
    index = list.findIndex((a) => a.name === identifier);
  }

  if (index === -1) {
    return { success: false, error: t('errorAliasNotFound', identifier) };
  }

  list.splice(index, 1);
  saveAliases(aliases);
  return { success: true };
}

export async function resolveId(type: AliasType, input: string): Promise<number | null> {
  const num = parseId(input);
  if (num !== undefined) {
    return num;
  }

  const aliases = loadAliases()[type];
  const alias = aliases.find((a) => a.name === input);
  if (alias) {
    return alias.id;
  }

  // Lazy: importing name-cache pulls in api.ts, which reads MDCLI_API_URL at
  // module load. Keep that off the path for alias CRUD and offline resolution.
  const { getNameIndex, nameKey } = await import('./name-cache.js');
  const index = await getNameIndex(type);
  return index[nameKey(input)] ?? null;
}

export async function resolveIds(type: AliasType, input: string): Promise<{ ids: number[]; unresolved: string[] }> {
  const parts = input.split(',').map((s) => s.trim());
  const ids: number[] = [];
  const remaining: string[] = [];

  for (const part of parts) {
    const num = parseId(part);
    if (num !== undefined) {
      ids.push(num);
      continue;
    }
    const alias = loadAliases()[type].find((a) => a.name === part);
    if (alias) {
      ids.push(alias.id);
      continue;
    }
    remaining.push(part);
  }

  if (remaining.length === 0) {
    return { ids, unresolved: [] };
  }

  const { getNameIndex, nameKey } = await import('./name-cache.js');
  const index = await getNameIndex(type);
  const unresolved: string[] = [];
  for (const part of remaining) {
    const id = index[nameKey(part)];
    if (id !== undefined) {
      ids.push(id);
    } else {
      unresolved.push(part);
    }
  }

  return { ids, unresolved };
}

/** The entity name each alias command is built for. */
const ALIAS_ENTITIES: Record<AliasType, () => string> = {
  accounts: () => t('aliasEntityAccount'),
  categories: () => t('aliasEntityCategory'),
  tags: () => t('aliasEntityTag'),
};

/** Attach identical `alias` add/list/rm/update subcommands for the given entity type. */
export function buildAliasCommand(parent: Command, type: AliasType): Command {
  const entity = ALIAS_ENTITIES[type]();

  const aliasCommand = parent.command('alias').description(t('aliasManageDescription', entity));

  aliasCommand
    .command('add')
    .description(t('aliasAddDescription', entity))
    .requiredOption('--id <id>', t('aliasIdOption', entity))
    .requiredOption('--name <name>', t('aliasNameOption'))
    .action((options: { id: string; name: string }) => {
      const id = parseId(options.id);
      if (id === undefined) {
        exitWithError(t('errorInvalidAliasId'));
      }
      const result = addAlias(type, id, options.name);
      if (result.success) {
        logger.success(t('aliasAdded', options.name, entity, id));
      } else {
        exitWithError(result.error ?? t('errorAliasAddFailed'));
      }
    });

  aliasCommand
    .command('list')
    .description(t('aliasListDescription', entity))
    .option('--json', t('jsonOption'))
    .action((options: { json?: boolean }) => {
      const aliases = getAliases(type);
      if (options.json) {
        console.log(JSON.stringify(aliases, null, 2));
        return;
      }
      if (aliases.length === 0) {
        logger.info(t('aliasNone'));
        return;
      }
      const table = new Table({
        head: [t('labelId'), t('aliasColumn')],
        style: { head: ['cyan'] },
      });
      for (const alias of aliases) {
        table.push([alias.id.toString(), alias.name]);
      }
      logger.header(t('aliasListHeader', entity, aliases.length));
      console.log(table.toString());
    });

  aliasCommand
    .command('rm')
    .description(t('aliasRemoveDescription', entity))
    .option('--id <id>', t('aliasIdOption', entity))
    .option('--name <name>', t('aliasNameOption'))
    .action((options: { id?: string; name?: string }) => {
      const identifier = options.id ?? options.name;
      if (!identifier) {
        exitWithError(t('errorAliasIdOrName'));
      }
      const result = removeAlias(type, identifier);
      if (result.success) {
        logger.success(t('aliasRemoved'));
      } else {
        exitWithError(result.error ?? t('errorAliasRemoveFailed'));
      }
    });

  aliasCommand
    .command('update')
    .description(t('aliasUpdateDescription', entity))
    .requiredOption('--id <id>', t('aliasIdOption', entity))
    .requiredOption('--name <name>', t('aliasNewNameOption'))
    .action((options: { id: string; name: string }) => {
      const id = parseId(options.id);
      if (id === undefined) {
        exitWithError(t('errorInvalidAliasId'));
      }
      const result = updateAlias(type, id, options.name);
      if (result.success) {
        logger.success(t('aliasUpdated', options.name, entity, id));
      } else {
        exitWithError(result.error ?? t('errorAliasUpdateFailed'));
      }
    });

  return aliasCommand;
}
