// Checked by `bun run typecheck`, never run: each @ts-expect-error fails tsc
// as "unused" the day the mock seed types stop refusing that shape, and the
// line after it is the positive control that the corrected shape compiles.
import type { SeedEntry } from '../scripts/mock-entry-seed.js';
import type { BankStatementResponse } from '../src/types/index.js';

type BankTransaction = NonNullable<BankStatementResponse['lancamentos']>[number];

export function refusesSeedShapes(): SeedEntry[] {
  return [
    // @ts-expect-error a reconciled expense omits transferencia
    { id: 1, descricao: 'x', tipo: 'd', status: 'conciliado', valor: -1, data: '2026-01-10', dataPrevista: '2026-01-10', dataEfetiva: '2026-01-10', conta: 1, transferencia: 0 },
    { id: 1, descricao: 'x', tipo: 'd', status: 'conciliado', valor: -1, data: '2026-01-10', dataPrevista: '2026-01-10', dataEfetiva: '2026-01-10', conta: 1 },
    // @ts-expect-error a reconciled expense requires dataEfetiva
    { id: 1, descricao: 'x', tipo: 'd', status: 'conciliado', valor: -1, data: '2026-01-10', dataPrevista: '2026-01-10', conta: 1 },
    // @ts-expect-error a scheduled row omits dataEfetiva
    { id: 1, descricao: 'x', tipo: 'd', status: 'agendado', valor: -1, data: '2027-01-10', dataPrevista: '2027-01-10', dataEfetiva: '2027-01-10', conta: 1 },
    { id: 1, descricao: 'x', tipo: 'd', status: 'agendado', valor: -1, data: '2027-01-10', dataPrevista: '2027-01-10', conta: 1 },
  ];
}

export function refusesStatementShapes(): BankTransaction[] {
  return [
    // @ts-expect-error ait values are string arrays
    { _ca: { ait: { d: 'tok-padaria' } } },
    { _ca: { ait: { d: ['tok-padaria'] } } },
    // @ts-expect-error categoria.v is a string
    { _ca: { c: { d: { categoria: { v: 11 } } } } },
    { _ca: { c: { d: { categoria: { v: '11' } } } } },
  ];
}
