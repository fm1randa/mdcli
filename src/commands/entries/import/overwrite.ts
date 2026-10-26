import { fetchSessionState } from '../../../lib/api.js';
import { asRecord } from '../../../lib/payload.js';
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

/**
 * Sets the preference on the run and what it does to each linked Entry, as the web's confirmation
 * dialog describes it (partials/importacao__v2-importacao-confirmar.html): `sd` fills only an Entry
 * without a description with the bank transaction's; `s` replaces contact, category, cost center,
 * project, tags and document number, never the value.
 */
export function applyOverwrite(run: RunDocument, document: ImportDocument, overwrite: Overwrite): void {
  run.overwrite = overwrite;
  if (!overwrite.description) return;
  for (const item of run.conciliated) {
    if (item.before.description !== null && item.before.description !== '') continue;
    const row = document.transactions.find((transaction) => transaction.integrationId === item.integrationId);
    item.after.description = row?.description ?? item.before.description;
  }
}
