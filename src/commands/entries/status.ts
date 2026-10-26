import type { Entry } from '../../types/index.js';

/**
 * What to do with the effective date and value(s): fill them in (that is
 * what confirms an entry), keep what the entry already has, or send null.
 */
type EffectiveFields = 'set' | 'keep' | 'clear';

export interface EntryStatusFlags {
  /** -p/--pending (or its hidden alias --scheduled): Confirmado off. */
  pending?: boolean;
  /** --confirmed: Confirmado on, Conciliado off. */
  confirmed?: boolean;
  /** -r/--reconciled (update): Confirmado and Conciliado on. */
  reconciled?: boolean;
}

export interface EntryStatusChoice {
  confirmado: boolean;
  conciliado: boolean;
  effective: EffectiveFields;
  /** A status flag was passed (on update, the entry's own status otherwise). */
  explicit: boolean;
}

/**
 * The status an entry is saved with, for create and update alike. The web
 * app's two toggles give three states (md.js, the entry form's save):
 * Confirmado off sends no effective date or value, and the API then labels
 * the entry pendente up to today and agendado after it; Confirmado on adds
 * them; Conciliado on top reconciles it (#79).
 *
 * - create (no `existing`): reconciles by default. A card purchase keeps
 *   Confirmado on, is never reconciled and has no effective date: -p and
 *   --confirmed do not apply to it.
 * - update (`existing`): without a flag the entry keeps its status, and an
 *   unconfirmed one (pendente/agendado) keeps its empty effective fields.
 */
export function buildEntryStatus(
  flags: EntryStatusFlags,
  context: { isCard?: boolean; existing?: Pick<Entry, 'status' | 'conciliado'> } = {}
): EntryStatusChoice {
  const explicit = Boolean(flags.pending || flags.confirmed || flags.reconciled);
  const { existing } = context;
  if (!existing && context.isCard) {
    return { confirmado: true, conciliado: false, effective: 'clear', explicit };
  }
  if (flags.pending) return { confirmado: false, conciliado: false, effective: 'clear', explicit };
  if (flags.confirmed) return { confirmado: true, conciliado: false, effective: 'set', explicit };
  if (flags.reconciled || !existing) return { confirmado: true, conciliado: true, effective: 'set', explicit };
  if (existing.status === 'agendado' || existing.status === 'pendente') {
    return { confirmado: false, conciliado: false, effective: 'keep', explicit };
  }
  return { confirmado: true, conciliado: existing.conciliado ?? false, effective: 'set', explicit };
}
