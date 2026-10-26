// GET /v2/lancamentos type=sum for scripts/mock-api.ts (the web's account balances, #67).
import { SEEDED_ENTRIES } from './mock-entries.js';

const round = (value: number): number => Math.round(value * 100) / 100;
const sum = (items: Array<Record<string, unknown>>): number => round(items.reduce((total, e) => total + Number(e.valor), 0));

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
  const sumRows = ids.filter((id) => !isCreditCardId(id)).map((conta) => {
    const own = entries.filter((e) => Number(e.conta) === conta);
    return {
      conta,
      projetado: sum(own),
      confirmado: sum(own.filter((e) => CONFIRMED_LABELS.includes(String(e.status)))),
    };
  });
  return Response.json({ sum: sumRows });
}
