import type { ptBRCatalog } from './pt-BR.js';

/**
 * The catalog shape. The pt-BR catalog defines it, so a key added there must be
 * added to en, and a message with parameters is a function whose signature both
 * catalogs share. `t()` and `message()` derive their arguments from it.
 */
export type Catalog = typeof ptBRCatalog;

export type MessageKey = keyof Catalog;

export type MessageArgs<K extends MessageKey> = Parameters<Catalog[K]>;
