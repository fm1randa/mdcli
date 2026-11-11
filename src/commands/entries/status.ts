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

/** One status request. Two flags at once are not a request. */
type StatusRequest =
  | { request: 'default' }
  | { request: 'pending' }
  | { request: 'confirmed' }
  | { request: 'reconciled' };

/**
 * The phase a save is in. Card create is its own phase: Confirmado stays on,
 * Conciliado stays off, and there is no effective date. The other phases are
 * the web form's three toggles (md.js, the entry form's save).
 */
type EntryPhase =
  | { phase: 'reconciled'; explicit: boolean }
  | { phase: 'confirmed'; explicit: boolean }
  | { phase: 'unconfirmed'; effective: 'clear' | 'keep'; explicit: boolean }
  | { phase: 'card-unreconciled'; explicit: boolean };

const REQUEST_FLAGS = ['pending', 'confirmed', 'reconciled'] as const;

/**
 * The one request the flags name. Pending, confirmed, and reconciled cannot
 * be combined: the first match used to win and drop the others.
 */
function statusRequest(flags: EntryStatusFlags): StatusRequest {
  const chosen = REQUEST_FLAGS.filter((name) => flags[name] === true);
  if (chosen.length > 1) {
    throw new Error('Use only one of pending, confirmed and reconciled.');
  }
  if (chosen[0] === 'pending') return { request: 'pending' };
  if (chosen[0] === 'confirmed') return { request: 'confirmed' };
  if (chosen[0] === 'reconciled') return { request: 'reconciled' };
  return { request: 'default' };
}

function explicitRequest(request: StatusRequest): boolean {
  return request.request !== 'default';
}

/** Named transitions from the request and the entry it applies to. */
function transitionEntryPhase(
  request: StatusRequest,
  existing: Pick<Entry, 'status' | 'conciliado'> | undefined,
): EntryPhase {
  const explicit = explicitRequest(request);
  switch (request.request) {
    case 'pending':
      return { phase: 'unconfirmed', effective: 'clear', explicit };
    case 'confirmed':
      return { phase: 'confirmed', explicit };
    case 'reconciled':
      return { phase: 'reconciled', explicit };
    case 'default':
      if (!existing) return { phase: 'reconciled', explicit };
      if (existing.status === 'agendado' || existing.status === 'pendente') {
        return { phase: 'unconfirmed', effective: 'keep', explicit };
      }
      return existing.conciliado === true
        ? { phase: 'reconciled', explicit }
        : { phase: 'confirmed', explicit };
  }
}

/** The wire fields for a phase. Unconfirmed is never reconciled, and never sets an effective date. */
function choiceForPhase(phase: EntryPhase): EntryStatusChoice {
  switch (phase.phase) {
    case 'reconciled':
      return { confirmado: true, conciliado: true, effective: 'set', explicit: phase.explicit };
    case 'confirmed':
      return { confirmado: true, conciliado: false, effective: 'set', explicit: phase.explicit };
    case 'unconfirmed':
      return { confirmado: false, conciliado: false, effective: phase.effective, explicit: phase.explicit };
    case 'card-unreconciled':
      return { confirmado: true, conciliado: false, effective: 'clear', explicit: phase.explicit };
  }
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
  context: { isCard?: boolean; existing?: Pick<Entry, 'status' | 'conciliado'> } = {},
): EntryStatusChoice {
  const { existing } = context;
  if (!existing && context.isCard) {
    const explicit = Boolean(flags.pending || flags.confirmed || flags.reconciled);
    return choiceForPhase({ phase: 'card-unreconciled', explicit });
  }
  return choiceForPhase(transitionEntryPhase(statusRequest(flags), existing));
}
