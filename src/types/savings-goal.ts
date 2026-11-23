/** One destination account of a savings goal. Its balance is saldo + saldoInicial (the web's chart). */
interface SavingsGoalAccount {
  conta: number;
  saldo: number;
  saldoInicial: number;
}

/**
 * One row of GET /v1/metas/economia. `valor` is the target, `data` the
 * deadline, `taxa` the monthly rate, and `saldo` the balance, initial
 * balances included. `status` false is an inactive goal.
 */
export interface SavingsGoal {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  taxa: number;
  saldo: number;
  status: boolean;
  contas: SavingsGoalAccount[];
  saldoInicial: number;
  dataSaldoInicial: string;
  /** The date of the latest movement; absent or null before the first one. */
  dataSaldo?: string | null;
}
