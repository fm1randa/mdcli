/**
 * One savings goal of GET /v1/metas/economia, the list the web app's
 * "Meta de economia (conta)" picker reads (md.js, mdwMetaEconomiaSelect).
 * Only the fields the CLI reads.
 */
export interface SavingsGoal {
  id: number;
  descricao: string;
  /** false: the goal is inactive, and the web picker hides it. */
  status: boolean;
  /** The accounts the goal uses. */
  contas: Array<{ conta: number }>;
}
