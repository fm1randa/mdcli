import { fetchSessionState } from '../../../lib/api.js';
import { asRecord } from '../../../lib/payload.js';
import { overwrittenFields, type ExistingEntry } from './candidates.js';
import type { ImportDocument } from './document.js';
import type { RunDocument } from './plan.js';

export type Overwrite = RunDocument['overwrite'];

/** The web default (`getConfig("conciliacao", {o: "d", s: false, sd: false})`), used when the preference cannot be read. */
const DEFAULT_OVERWRITE: Overwrite = { value: false, description: false, source: 'default' };

/**
 * The user's `conciliacao` preference, read like the web: the session state's `payload.ngInit` is
 * window.mdconfig (session.js), configuracoesService takes `usuario.config.mdweb` from it
 * (mdb.js 49687-49689), and getConfig fills what was never saved with the defaults (mdb.js 49696-49701,
 * 20900-20903). A failed request or a state that is not the logged-in app gives the web default.
 */
export async function readOverwrite(): Promise<Overwrite> {
  let state: Record<string, unknown> | null;
  try {
    state = asRecord(await fetchSessionState());
  } catch {
    return DEFAULT_OVERWRITE;
  }
  const ngInit = asRecord(asRecord(state?.payload)?.ngInit);
  if (state?.branch !== 'app' || ngInit === null) return DEFAULT_OVERWRITE;
  const mdweb = asRecord(asRecord(asRecord(ngInit.usuario)?.config)?.mdweb);
  const saved = asRecord(mdweb?.conciliacao) ?? {};
  return { value: saved.s === true, description: saved.sd === true, source: 'preferences' };
}

/** What `applyOverwrite` reads besides the run: the statement rows and the Entries it may link. */
export interface OverwriteSources {
  document: ImportDocument;
  /** The raw statement rows, row for row with `document.transactions`: what commit.ts sends. */
  statementRows: readonly unknown[];
  existing: ReadonlyMap<number, ExistingEntry>;
}

/**
 * Sets the preference on the run and what it does to each linked Entry, as the web's confirmation
 * dialog describes it for a bank import (partials/importacao__v2-importacao-confirmar.html, line 1;
 * `tipoArquivo` is not "ofx", mdb.js 21369): `sd` fills only an Entry without a description with the
 * bank transaction's; `s` updates the Entries that are not reconciled, replacing contact, category,
 * cost center, project, tags and document number with the statement row's, never the value.
 */
export function applyOverwrite(run: RunDocument, overwrite: Overwrite, sources: OverwriteSources): void {
  run.overwrite = overwrite;
  const { document } = sources;
  for (const item of run.conciliated) {
    const index = document.transactions.findIndex((transaction) => transaction.integrationId === item.integrationId);
    if (overwrite.description && (item.before.description === null || item.before.description === '')) {
      item.after.description = document.transactions[index]?.description ?? item.before.description;
    }
    if (!overwrite.value) continue;
    const entry = sources.existing.get(item.entryId);
    const before = entry?.fields ?? overwrittenFields(null);
    item.reconciled = entry?.reconciled === true;
    Object.assign(item.before, before);
    Object.assign(item.after, item.reconciled ? before : overwrittenFields(asRecord(sources.statementRows[index]), before));
  }
}
