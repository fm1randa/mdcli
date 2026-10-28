import type { Catalog } from './types.js';
import { enCommon } from './catalog/en/common.js';
import { enAuth } from './catalog/en/auth.js';
import { enResources } from './catalog/en/resources.js';
import { enEntries } from './catalog/en/entries.js';
import { enImport } from './catalog/en/import.js';
import { enInternals } from './catalog/en/internals.js';

/** The English catalog. Typed by the pt-BR catalog, so a missing key fails typecheck. */
export const enCatalog: Catalog = {
  ...enCommon,
  ...enAuth,
  ...enResources,
  ...enEntries,
  ...enImport,
  ...enInternals,
};
