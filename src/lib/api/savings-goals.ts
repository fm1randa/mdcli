import type { SavingsGoal } from '../../types/index.js';
import { request } from './request.js';

/** GET /v1/metas/economia: every savings goal, active or not, as a plain array. */
export async function fetchSavingsGoals(): Promise<SavingsGoal[]> {
  return request<SavingsGoal[]>('GET', '/v1/metas/economia');
}
