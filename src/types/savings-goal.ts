/** One account of a savings goal. Its balance is saldo + saldoInicial (the web's chart). */
interface SavingsGoalAccount {
  conta: number;
  /** The figures `goals` reads; the picker of `entries create --savings-goal` reads only `conta`. */
  saldo?: number;
  saldoInicial?: number;
}

/**
 * One savings goal of GET /v1/metas/economia (md.js metaseconomiaService and
 * the mdwMetaEconomiaSelect picker). `valor` is the target, `data` the
 * deadline, `taxa` the monthly rate, and `saldo` the balance, initial
 * balances included. The API always sends the figures; they are optional
 * here because the picker of `entries create --savings-goal` reads only id,
 * descricao, status and contas. `goals` refuses a goal without them
 * (src/lib/savings-goals.ts).
 */
export interface SavingsGoal {
  id: number;
  descricao: string;
  /** false: the goal is inactive, and the web hides it. */
  status: boolean;
  /** The accounts the goal uses. */
  contas: SavingsGoalAccount[];
  valor?: number;
  data?: string;
  taxa?: number;
  saldo?: number;
  saldoInicial?: number;
  dataSaldoInicial?: string;
  /** The date of the latest movement; absent or null before the first one. */
  dataSaldo?: string | null;
}
