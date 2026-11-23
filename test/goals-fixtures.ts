import type { Entry, SavingsGoal } from '../src/types/index.js';

// Savings goals (#339), read with "today" pinned to 2026-11-23 (GOALS_TODAY).
// 7 is active with months left, 8 has no contribution month left (deadline
// 2026-06, latest movement 2026-05), 9 is inactive. 8 and 9 are the goals the
// seeded entries 54, 56 and 72 already carry.
export const GOALS_TODAY = '2026-11-23';

export const SAVINGS_GOALS: SavingsGoal[] = [
  {
    id: 9,
    descricao: 'Carro Teste',
    valor: 30000,
    data: '2028-06-01',
    taxa: 0.008,
    saldo: 0,
    status: false,
    contas: [{ conta: 204, saldo: 0, saldoInicial: 0 }],
    saldoInicial: 0,
    dataSaldoInicial: '2026-03-01',
    dataSaldo: null,
  },
  {
    id: 8,
    descricao: 'Reserva Teste',
    valor: 5000,
    data: '2026-06-01',
    taxa: 0,
    saldo: 4200,
    status: true,
    contas: [{ conta: 204, saldo: 2200, saldoInicial: 2000 }],
    saldoInicial: 2000,
    dataSaldoInicial: '2025-01-01',
    dataSaldo: '2026-05-10',
  },
  {
    id: 7,
    descricao: 'Viagem Teste',
    valor: 12000,
    data: '2027-12-01',
    taxa: 0.005,
    saldo: 3000,
    status: true,
    contas: [
      { conta: 204, saldo: 1500, saldoInicial: 1000 },
      { conta: 201, saldo: 500, saldoInicial: 0 },
    ],
    saldoInicial: 1000,
    dataSaldoInicial: '2026-01-10',
    dataSaldo: '2026-11-05',
  },
];

function movement(id: number, goal: number, date: string, valor: number, conta: number): Entry {
  const side = valor < 0 ? { metaEconomiaOrigem: goal } : { metaEconomiaDestino: goal };
  return {
    id,
    descricao: valor < 0 ? 'Resgate Meta Teste' : 'Aporte Meta Teste',
    tipo: 't',
    valor,
    valorT: -valor,
    data: date,
    dataPrevista: date,
    dataEfetiva: date,
    status: 'conciliado',
    conciliado: true,
    conta,
    contaT: conta === 204 ? 201 : 204,
    transferencia: id + 1,
    categoria: 30,
    tags: [],
    ...side,
  };
}

/** Each goal's movements, oldest first, as GET /v1/metas/economia/:id/lancamentos answers them. */
export const GOAL_MOVEMENTS: Record<number, Entry[]> = {
  7: [
    movement(61, 7, '2026-02-05', 500, 204),
    movement(63, 7, '2026-06-05', 1000, 204),
    movement(65, 7, '2026-11-05', 500, 201),
  ],
  8: [
    movement(54, 8, '2025-06-16', -200, 204),
    movement(56, 8, '2025-06-17', 150, 204),
    movement(67, 8, '2026-05-10', 2250, 204),
  ],
  9: [],
};

/** The movements of `goal` from `start` to `end`, both inclusive. */
export function goalMovements(goal: number, start: string, end: string): Entry[] {
  return (GOAL_MOVEMENTS[goal] ?? []).filter((entry) => entry.data >= start && entry.data <= end);
}

/** GET /v1/metas/economia/:id/saldo?data: the initial balance plus every movement up to `date`; 0 before the goal starts. */
export function goalBalanceAt(goal: number, date: string): number {
  const found = SAVINGS_GOALS.find((candidate) => candidate.id === goal);
  if (!found || date < found.dataSaldoInicial) return 0;
  return goalMovements(goal, '0000-01-01', date).reduce((sum, entry) => sum + entry.valor, found.saldoInicial);
}
