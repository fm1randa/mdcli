
import { ptBRCommon } from './catalog/pt-BR/common.js';
import { ptBRAuth } from './catalog/pt-BR/auth.js';
import { ptBRResources } from './catalog/pt-BR/resources.js';
import { ptBREntries } from './catalog/pt-BR/entries.js';
import { ptBRImport } from './catalog/pt-BR/import.js';
import { ptBRInternals } from './catalog/pt-BR/internals.js';

/**
 * The pt-BR catalog. It is the source of truth for the message keys and their
 * parameters: `Catalog` is `typeof ptBRCatalog`, so the en catalog has to match
 * every key and signature, and `t()` only accepts a key that exists here.
 */
export const ptBRCatalog = {
  ...ptBRCommon,
  ...ptBRAuth,
  ...ptBRResources,
  ...ptBREntries,
  ...ptBRImport,
  ...ptBRInternals,
};
