// Checked by `bun run typecheck`, never run: each @ts-expect-error fails tsc
// as "unused" the day the route types stop refusing that payload, and the line
// after it is the positive control that the same call compiles in shape.
import { json } from '../scripts/mock-http.js';
import { CHECKING_ACCOUNT, SAMPLE_ENTRIES, firstInvoice } from './fixtures.js';
import type { MockApi } from './helpers.js';

export function refusesTestFixtures(api: MockApi): void {
  // @ts-expect-error #266: primeiraFatura answers an object, not a date string.
  api.on('GET /v1/cartoes/202/primeiraFatura', () => '2026-02-21T00:00:00');
  api.on('GET /v1/cartoes/202/primeiraFatura', () => firstInvoice(202, '2026-02-21T00:00:00', '2026-02-11T00:00:00'));

  // @ts-expect-error #270: GET /v1/lancamentos/:id answers transferencia as a number.
  api.on('GET /v1/lancamentos/70', { ...SAMPLE_ENTRIES[0], transferencia: true });
  api.on('GET /v1/lancamentos/70', { ...SAMPLE_ENTRIES[0], transferencia: 0 });

  // @ts-expect-error a route the map does not know has no response type.
  api.on('GET /v1/rota/inexistente', {});
}

export function refusesMockPayloads(): Response[] {
  return [
    // @ts-expect-error the accounts list carries meta beside items.
    json<'GET /v1/cadastros/contas'>({ items: [CHECKING_ACCOUNT] }),
    json<'GET /v1/cadastros/contas'>({ meta: { tipos: [], gruposbp: [], finalidades: [] }, items: [CHECKING_ACCOUNT] }),
    // @ts-expect-error json without a route accepts no body.
    json(CHECKING_ACCOUNT),
  ];
}
