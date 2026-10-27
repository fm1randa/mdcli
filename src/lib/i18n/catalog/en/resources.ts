import type { ptBRResources as SectionType } from '../pt-BR/resources.js';

/** Categories, tags, cards, sync and aliases, in English. Typed by the pt-BR section, so a missing key fails typecheck. */

export const enResources: typeof SectionType = {
  // --- Categories ----------------------------------------------------------------
  categoriesManageDescription: () => 'Manage categories',
  categoriesListDescription: () => 'List all categories',
  categoriesListTypeOption: () => 'Show only one type: expense, income, or transfer',
  categoriesActiveOnlyOption: () => 'Show only active categories',
  categoriesHeader: (count) => `Categories (${count})`,
  categoriesCreateDescription: () => 'Create a category or, with --parent, a subcategory',
  categoriesCreateNameOption: () => 'Category name',
  categoriesCreateTypeOption: () => 'expense or income (inherited from --parent when omitted)',
  categoriesCreateParentOption: () => 'Parent category (ID, alias, or name)',
  categoriesUpdateDescription: () => 'Update a category (only the fields you pass are changed)',
  categoriesUpdateNameOption: () => 'New category name',
  categoriesUpdateActiveOption: () => 'Mark the category as active',
  categoriesUpdateInactiveOption: () => 'Mark the category as inactive (archive)',
  categoriesDeleteDescription: () => 'Delete a category, moving its entries to another category',
  categoriesDeleteMoveToOption: () => 'Category (ID, alias, or name) that receives the entries',
  categoryCreated: (name) => `Category "${name}" created successfully!`,
  categoryUpdated: (name) => `Category "${name}" updated successfully!`,
  categoryDeleted: (id, destination) => `Category ${id} deleted; its entries now belong to "${destination}".`,
  errorInvalidCategoryId: () => 'Invalid category ID. Must be a number.',
  errorCategoryNotFound: (input) => `Category "${input}" not found. See: mdcli categories list`,
  errorCategoryIdNotFound: (id) => `Category ${id} not found.`,
  errorInvalidCategoryType: (value) => `Invalid type "${value}". Use expense, income, or transfer.`,
  errorInvalidCategoryTypeParent: (value) => `Invalid type "${value}". Use expense or income.`,
  errorCategoryTypeRequired: () =>
    'Use --type (expense or income) for a top-level category, or --parent for a subcategory.',
  errorTransferCategorySubcategory: () => 'Transfer categories cannot have subcategories.',
  errorCategoryTypeMismatch: () => "--type doesn't match the parent category's type.",
  errorCategoryTypeUndetermined: () => 'Could not determine the category type.',
  errorCategoryNoChanges: () => 'No changes specified. Use --name, --active or --inactive.',
  errorCategorySystemEdit: (name) => `Category "${name}" can't be edited (system category).`,
  errorCategorySystemDelete: (name) => `Category "${name}" can't be deleted (system category).`,
  errorCategoryHasChildren: (name) => `Category "${name}" has subcategories. Delete or move them first.`,
  errorMoveToSameCategory: () => '--move-to must be a different category.',
  errorMoveToSameType: (name) => `--move-to must be the same type as "${name}".`,
  confirmDeleteCategory: (name, id, destination) =>
    `Delete category "${name}" (${id}) and move its entries to "${destination}"? (y/N) `,

  // --- Tags ----------------------------------------------------------------------
  tagsManageDescription: () => 'Manage tags',
  tagsListDescription: () => 'List all tags',
  tagsActiveOnlyOption: () => 'Show only active tags',
  tagsHeader: (count) => `Tags (${count})`,
  tagsCreateDescription: () => 'Create a new tag',
  tagsCreateNameOption: () => 'Tag name',
  tagsCreateColorOption: () => 'Tag color as a hex code (e.g. #FF0000), defaults to gray',
  tagsUpdateDescription: () => 'Update a tag (only the fields you pass are changed)',
  tagsUpdateNameOption: () => 'New tag name',
  tagsUpdateColorOption: () => 'New tag color as a hex code (e.g. #FF0000)',
  tagsUpdateActiveOption: () => 'Mark the tag as active',
  tagsUpdateInactiveOption: () => 'Mark the tag as inactive (archive)',
  tagsDeleteDescription: () => 'Delete a tag',
  tagCreated: (name) => `Tag "${name}" created successfully!`,
  tagUpdated: (name) => `Tag "${name}" updated successfully!`,
  tagDeleted: (id) => `Tag ${id} deleted successfully!`,
  errorInvalidTagId: () => 'Invalid tag ID. Must be a number.',
  errorTagNotFound: (id) => `Tag ${id} not found.`,
  errorTagNoChanges: () => 'No changes specified. Use --name, --color, --active or --inactive.',
  errorInvalidColor: () => 'Invalid color. Use a 6-digit hex code, e.g. #FF0000.',
  confirmDeleteTag: (name, id) => `Are you sure you want to delete tag "${name}" (${id})? (y/N) `,

  // --- Cards ---------------------------------------------------------------------
  cardsManageDescription: () => 'Manage credit cards',
  cardsListDescription: () => 'List all credit cards',
  cardsActiveOnlyOption: () => 'Show only active credit cards',
  cardsNextDue: () => 'Next Due',
  cardsHeader: (count) => `Credit Cards (${count})`,
  cardsInvoiceDescription: () => 'Show credit card invoice entries',
  cardsAccountOption: () => 'Card ID, alias, or exact name (case-insensitive)',
  cardsInvoiceMonthOption: () =>
    "Invoice month, due on the card's due day (default: current/next invoice)",
  cardsInvoiceJsonOption: () => 'Output as JSON (an array of items)',
  cardsInvoiceSummaryOption: () =>
    'Only the invoice summary; with --json, print { invoice, entries } instead of the array',
  cardsFutureDescription: () => 'Show future installments for credit card',
  cardsInvoiceHeader: (name, dueDate, count, total) =>
    `Invoice for ${name} - ${dueDate} (${count} entries) | Total: ${total}`,
  cardsFutureHeader: (name, count, total) =>
    `Future Installments for ${name} (${count} items) | Total: ${total}`,
  errorAccountNotFoundById: (id) => `Account not found: ${id}`,
  errorNotCreditCard: (id) => `Account ${id} is not a credit card`,

  // --- Sync ----------------------------------------------------------------------
  syncManageDescription: () => 'List connections and request a Sync',
  syncListDescription: () => 'List connections and the accounts linked to each one',
  syncRunDescription: () =>
    'Request a Sync for the Connection that contains an Account, or for every Connection',
  syncRunAccountArgument: () => 'Account Identifier (id, alias, or exact name), or "all"',
  syncRunYesOption: () => 'Skip the confirmation prompt',
  syncRunJsonOption: () => 'Output as JSON (requires --yes)',
  syncConnectionColumn: () => 'Connection',
  syncConnectionAccountColumn: () => 'Connection account',
  syncNoAccount: () => 'No account',
  syncConnectionsHeader: (count) => `Connections (${count})`,
  syncConfirmationOne: (id) =>
    `Request a Sync for connection ${id}? Each connector accepts at most 3 Syncs per day. (y/N) `,
  syncConfirmationMany: (ids) =>
    `Request a Sync for connections ${ids}? Each connector accepts at most 3 Syncs per day. (y/N) `,
  errorSyncRequiresYes: () => 'sync run --json requires --yes',
  syncNoConnections: () => 'No connections to sync.',
  syncCancelled: () => 'Sync cancelled.',
  syncNone: () => 'none',
  syncAlreadyUpdated: (reason, done) => `${reason} Already updated: ${done}.`,
  syncUpdatingOne: (id) => `Connection ${id} is UPDATING. Run sync list again to see the result.`,
  syncUpdatingMany: (ids) =>
    `Connections ${ids} are UPDATING. Run sync list again to see the result.`,
  errorConnectionsPayload: () => 'GET /v1/integracao/connections did not return a list of connections',
  errorConnectionMissingId: (id) =>
    `Account ${id} is linked to a connection that did not include its id.`,
  errorAccountWithoutConnection: (id) => `Account ${id} is not linked to any connection.`,
  errorAccountMultipleConnections: (id, connections) =>
    `Account ${id} is linked to more than one connection (${connections}).`,
  errorAccountLinkedTwice: (id, connectionId, accounts) =>
    `Account ${id} is linked twice on connection ${connectionId} (${accounts}).`,

  // --- Aliases -------------------------------------------------------------------
  aliasEntityAccount: () => 'account',
  aliasEntityCategory: () => 'category',
  aliasEntityTag: () => 'tag',
  aliasManageDescription: (entity) => `Manage ${entity} aliases`,
  aliasAddDescription: (entity) => `Add an alias for ${entity === 'account' ? 'an' : 'a'} ${entity}`,
  aliasListDescription: (entity) => `List all ${entity} aliases`,
  aliasRemoveDescription: (entity) => `Remove a ${entity} alias`,
  aliasUpdateDescription: (entity) => `Update a ${entity} alias`,
  aliasIdOption: (entity) => `${entity.charAt(0).toUpperCase()}${entity.slice(1)} ID`,
  aliasNameOption: () => 'Alias name',
  aliasNewNameOption: () => 'New alias name',
  aliasListHeader: (entity, count) =>
    `${entity.charAt(0).toUpperCase()}${entity.slice(1)} Aliases (${count})`,
  aliasColumn: () => 'Alias',
  aliasNone: () => 'No aliases defined',
  aliasAdded: (name, entity, id) => `Alias "${name}" added for ${entity} ${id}`,
  aliasUpdated: (name, entity, id) => `Alias updated to "${name}" for ${entity} ${id}`,
  aliasRemoved: () => 'Alias removed',
  errorInvalidAliasId: () => 'Invalid ID. Must be a number.',
  errorAliasExists: (name) => `Alias "${name}" already exists`,
  errorAliasIdExists: (id, name) => `ID ${id} already has alias "${name}"`,
  errorAliasNotFoundForId: (id) => `No alias found for ID ${id}`,
  errorAliasNotFound: (identifier) => `No alias found for "${identifier}"`,
  errorAliasIdOrName: () => 'Either --id or --name is required',
  errorAliasAddFailed: () => 'Failed to add alias',
  errorAliasRemoveFailed: () => 'Failed to remove alias',
  errorAliasUpdateFailed: () => 'Failed to update alias',
};
