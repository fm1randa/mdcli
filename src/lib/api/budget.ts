import type { BudgetGoalSave } from '../../types/budget.js';
import { apiPost } from './request.js';

/** POST /v1/metas/orcamento. The success body is unused; the next `mdcli budget` is the check. */
export async function saveBudgetGoals(payload: BudgetGoalSave): Promise<unknown> {
  return apiPost<unknown>('/v1/metas/orcamento', payload);
}
