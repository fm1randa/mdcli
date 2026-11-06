// GET /v2/lancamentos type=sum for scripts/mock-api.ts (the web's account balances, #67).
import type { AccountBalancesResponse, AccountBalanceSum } from '../src/types/index.js';
import { roundToCents } from '../src/utils/currency.js';
import { SEEDED_ENTRIES } from './mock-entries.js';

const sum = (items: ReadonlyArray<{ valor: number }>): number => roundToCents(items.reduce((total, e) => total + e.valor, 0));

const CONFIRMED_LABELS = ['conciliado', 'confirmado'];

/**
 * GET /v2/lancamentos type=sum grouped by account (the web's balances): every
 * seeded entry up to fim is projetado, the confirmed ones also confirmado.
 * Like the real API, a requested card gets no row.
 */
export function balancesRoute(url: URL, isCreditCardId: (conta: unknown) => boolean): Response {
  const ids = (JSON.parse(url.searchParams.get('contas') ?? '{}') as { ids?: number[] }).ids ?? [];
  const to = url.searchParams.get('fim') ?? '';
  const entries = Object.values(SEEDED_ENTRIES).filter((e) => String(e.dataPrevista) <= to);
  const sumRows: AccountBalanceSum[] = ids.filter((id) => !isCreditCardId(id)).map((conta) => {
    const own = entries.filter((e) => e.conta === conta);
    return {
      conta,
      projetado: sum(own),
      confirmado: sum(own.filter((e) => CONFIRMED_LABELS.includes(String(e.status)))),
    };
  });
  const response: AccountBalancesResponse = { sum: sumRows };
  return Response.json(response);
}
