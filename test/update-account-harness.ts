import { createHome, MANUAL_AUTH, mutations, type MockApi, startMockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT } from './fixtures.js';

// Shared by the entries update --account tests (#123).
// NuCel (#123): a fixed monthly series on Nubank (1001), scheduled.
export const FIXED_OCCURRENCE = {
  id: 80,
  descricao: 'NuCel',
  tipo: 'd',
  valor: -45,
  valorPrevisto: -45,
  data: '2027-01-10',
  dataPrevista: '2027-01-10',
  status: 'agendado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  parcela: 'fixa',
  agendaId: 77,
  agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
  tags: [],
};

// Confirmed on Nubank, not reconciled.
export const CONFIRMED_ENTRY = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  valorPrevisto: -12.5,
  valorEfetivo: -12.5,
  data: '2026-01-05',
  dataPrevista: '2026-01-04',
  dataEfetiva: '2026-01-05',
  status: 'confirmado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  tags: [],
};

export const INTER_ACCOUNT = { ...CHECKING_ACCOUNT, id: 1006, nome: 'Inter' };
// fechamento: the invoice closes that many days before it is due.
export const BLUE_CARD = { ...CREDIT_CARD_ACCOUNT, fechamento: 8 };
export const GOLD_CARD = { ...CREDIT_CARD_ACCOUNT, id: 1005, nome: 'Cartão Ouro', proximoVencimento: '2026-01-10T00:00:00', fechamento: 8 };

// On Cartão Azul (1002): bought on 2026-01-05, on the invoice due 2026-01-16.
export const CARD_PURCHASE = {
  id: 90,
  descricao: 'Livro',
  tipo: 'd',
  valor: -80,
  valorPrevisto: -80,
  data: '2026-01-05',
  dataPrevista: '2026-01-16',
  dataCompetencia: '2026-01-05',
  status: 'nconciliado',
  conciliado: false,
  conta: 1002,
  categoria: 10,
  plastico: 7,
  tags: [],
};

// Nubank (1001) -> Poupança (1004), seen from the destination half: the API
// hands back either half of the pair.
export const TRANSFER_DESTINATION_HALF = {
  id: 51,
  descricao: 'Reserva',
  tipo: 't',
  valor: 300,
  valorT: -300,
  data: '2026-01-15',
  dataPrevista: '2026-01-15',
  dataEfetiva: '2026-01-15',
  status: 'conciliado',
  conciliado: true,
  conta: 1004,
  contaT: 1001,
  categoria: 30,
  tags: [],
};

/** A mock API with the accounts and entries above, and a home with the alias reserva -> 1004. */
export function startUpdateAccountApi(): { api: MockApi; home: TestHome } {
  const api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, BLUE_CARD, SAVINGS_ACCOUNT, INTER_ACCOUNT, GOLD_CARD] });
  for (const entry of [TRANSFER_DESTINATION_HALF, FIXED_OCCURRENCE, CONFIRMED_ENTRY, CARD_PURCHASE]) {
    api.on(`GET /v1/lancamentos/${entry.id}`, entry);
    api.on(`PUT /v1/lancamentos/${entry.id}`, (req) => ({ ...entry, ...(req.body as object) }));
  }
  // Cartão Azul has a holder plastic; Cartão Ouro has none.
  api.on('GET /v1/cadastros/plasticos', [{ id: 21, conta: 1002, tipo: 'T', titular: true, nome: 'Bia', status: true }]);
  const home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 1004, name: 'reserva' }], categories: [], tags: [] },
  });
  return { api, home };
}

/** The body of the PUT the CLI sent. */
export function putBody(api: MockApi): Record<string, unknown> {
  const put = mutations(api).find((r) => r.method === 'PUT');
  if (!put) throw new Error('no PUT was sent');
  return put.body as Record<string, unknown>;
}
