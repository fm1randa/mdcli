import type { Entry } from '../src/types/index.js';
import { SAVINGS_GOALS } from './fixtures.js';

/** The day goal tests pin as today, so the compound-interest figure is a literal. */
export const GOALS_TODAY = '2026-11-23';

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
};

/** The movements of `goal` from `start` to `end`, both inclusive. */
export function goalMovements(goal: number, start: string, end: string): Entry[] {
  return (GOAL_MOVEMENTS[goal] ?? []).filter((entry) => entry.data >= start && entry.data <= end);
}

/** GET /v1/metas/economia/:id/saldo?data: the initial balance plus every movement up to `date`; 0 before the goal starts. */
export function goalBalanceAt(goal: number, date: string): number {
  const found = SAVINGS_GOALS.find((candidate) => candidate.id === goal);
  if (!found?.dataSaldoInicial || date < found.dataSaldoInicial) return 0;
  return goalMovements(goal, '0000-01-01', date).reduce((sum, entry) => sum + entry.valor, found.saldoInicial ?? 0);
}
