import { exitWithError } from '../../utils/action.js';
import { parseId } from '../../utils/parse.js';
import { t } from '../../lib/i18n/index.js';
import { fetchSavingsGoals } from '../../lib/api.js';
import type { CreateEntryPayload } from '../../types/index.js';

export type SavingsGoalLink = Pick<CreateEntryPayload, 'metaEconomiaDestino' | 'metaEconomiaOrigem'>;

/** --savings-goal as an ID, refused before any API call when it is not one. */
export function parseSavingsGoalId(input: string): number {
  const id = parseId(input);
  if (id === undefined) exitWithError(t('errorInvalidSavingsGoal', input));
  return id;
}

/**
 * The link a transfer carries to a savings goal. The web app offers, per
 * account, only the active goals that use that account (md.js,
 * mdwMetaEconomiaSelect), and sends the destination's pick as
 * metaEconomiaDestino (a deposit) and the origin's as metaEconomiaOrigem (a
 * withdrawal). A goal that uses both accounts is refused rather than guessed.
 */
export async function resolveSavingsGoalLink(goalId: number, originId: number, destinationId: number): Promise<SavingsGoalLink> {
  const goal = (await fetchSavingsGoals()).find((g) => g.id === goalId);
  if (!goal) exitWithError(t('errorSavingsGoalNotFound', goalId));
  if (!goal.status) exitWithError(t('errorSavingsGoalInactive', goalId, goal.descricao));
  const uses = (accountId: number): boolean => goal.contas.some((c) => c.conta === accountId);
  const deposit = uses(destinationId);
  const withdrawal = uses(originId);
  if (deposit && withdrawal) exitWithError(t('errorSavingsGoalBothAccounts', goalId, goal.descricao));
  if (deposit) return { metaEconomiaDestino: goalId };
  if (withdrawal) return { metaEconomiaOrigem: goalId };
  exitWithError(t('errorSavingsGoalNoAccount', goalId, goal.descricao, originId, destinationId));
}
