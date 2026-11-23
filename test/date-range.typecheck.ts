// Checked by `bun run typecheck`, never run: each @ts-expect-error fails tsc
// as "unused" the day a hand-built object becomes a DateRange again, and the
// line after it is the positive control that a constructed range compiles.
import { loadBudget, type BudgetQuery } from '../src/lib/budget.js';

type DateRange = BudgetQuery['period'];

export function refusesHandBuiltRange(constructed: DateRange): DateRange[] {
  // @ts-expect-error #319: a literal skips the start <= end check of dateRange.
  const reversed: DateRange = { start: '2026-11-30', end: '2026-11-01' };
  const kept: DateRange = constructed;
  return [reversed, kept];
}

export async function refusesHandBuiltBudgetPeriod(constructed: DateRange): Promise<void> {
  // @ts-expect-error #319: the budget query takes only a constructed range.
  await loadBudget({ period: { start: '2026-11-30', end: '2026-11-01' }, regime: 'cash' });
  await loadBudget({ period: constructed, regime: 'cash' });
}
