import type { Catalog } from './types.js';
import { enCommon } from './catalog/en/common.js';
import { enAuth } from './catalog/en/auth.js';
import { enResources } from './catalog/en/resources.js';
import { enEntriesManage } from './catalog/en/manage.js';
import { enEntriesCreate } from './catalog/en/create.js';
import { enEntriesUpdateDelete } from './catalog/en/update-delete.js';
import { enEntriesDelete } from './catalog/en/delete.js';
import { enEntriesSummary } from './catalog/en/summary.js';
import { enEntriesImportOutput } from './catalog/en/import-output.js';
import { enImport } from './catalog/en/import.js';
import { enInternals } from './catalog/en/internals.js';

/** The English catalog. Typed by the pt-BR catalog, so a missing key fails typecheck. */
export const enCatalog: Catalog = {
  ...enCommon,
  ...enAuth,
  ...enResources,
  ...enEntriesManage,
  ...enEntriesCreate,
  ...enEntriesUpdateDelete,
  ...enEntriesDelete,
  ...enEntriesSummary,
  ...enEntriesImportOutput,
  ...enImport,
  ...enInternals,
};
