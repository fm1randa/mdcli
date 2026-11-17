/** Budget kind code on a budget row. Category records use d|r|t. Budget rows use d|r|i. */
export type BudgetKindCode = 'd' | 'r' | 'i';

/**
 * One row of GET /v2/lancamentos/metasorcamento. No `categoria` means the
 * general goal of `tipo`. `categoriaPai` means a subcategory of that parent.
 * Signs and the remaining/surplus split are the API's.
 */
export interface BudgetGoalRow {
  meta: number | null;
  residuo: number;
  confirmado: number;
  projetado: number;
  realizarc: number;
  realizarp: number;
  excedentec: number;
  excedentep: number;
  categoria?: number;
  categoriaPai?: number | null;
  /** `d`, `r` or `i`. Any other code is ignored. */
  tipo: string;
}
