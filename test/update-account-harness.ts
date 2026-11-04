import { createHome, MANUAL_AUTH, mutations, type MockApi, startMockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT, SAVINGS_ACCOUNT } from './fixtures.js';

// Shared by the entries update --account tests (#123).
// Assinatura Teste (#123): a fixed monthly series on Conta Teste (201), scheduled.
export const FIXED_OCCURRENCE = {
  id: 80,
  descricao: 'Assinatura Teste',
  tipo: 'd',
  valor: -45,
  valorPrevisto: -45,
  data: '2027-01-10',
  dataPrevista: '2027-01-10',
  status: 'agendado',
  conciliado: false,
  conta: 201,
  categoria: 10,
  parcela: 'fixa',
  agendaId: 77,
  agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
  tags: [],
};

// Confirmed on Conta Teste, not reconciled.
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
  conta: 201,
  categoria: 10,
  tags: [],
};

export const SECOND_ACCOUNT = { ...CHECKING_ACCOUNT, id: 1006, nome: 'Conta Teste Dois' };
// Archived: the web app's account selectors leave it out.
export const ARCHIVED_ACCOUNT = { ...CHECKING_ACCOUNT, id: 1007, nome: 'Antiga', status: false };
// fechamento: the invoice closes that many days before it is due.
export const BASE_CARD = { ...CREDIT_CARD_ACCOUNT, fechamento: 8 };
export const OTHER_CARD = { ...CREDIT_CARD_ACCOUNT, id: 205, nome: 'Cartão Teste Dois', proximoVencimento: '2026-01-10T00:00:00', fechamento: 8 };

// On Cartão Teste (202): bought on 2026-01-05, on the invoice due 2026-01-16.
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
  conta: 202,
  categoria: 10,
  plastico: 62,
  tags: [],
};

// Conta Teste (201) -> Poupança (204), seen from the destination half: the API
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
  conta: 204,
  contaT: 201,
  categoria: 30,
  tags: [],
};

/** A mock API with the accounts and entries above, and a home with the alias reserva -> 204. */
export function startUpdateAccountApi(): { api: MockApi; home: TestHome } {
  const api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, BASE_CARD, SAVINGS_ACCOUNT, SECOND_ACCOUNT, OTHER_CARD, ARCHIVED_ACCOUNT] });
  for (const entry of [TRANSFER_DESTINATION_HALF, FIXED_OCCURRENCE, CONFIRMED_ENTRY, CARD_PURCHASE]) {
    api.on(`GET /v1/lancamentos/${entry.id}`, entry);
    api.on(`PUT /v1/lancamentos/${entry.id}`, (req) => ({ ...entry, ...(req.body as object) }));
  }
  // Cartão Teste has a holder plastic; Cartão Teste Dois has none.
  api.on('GET /v1/cadastros/plasticos', [{ id: 21, conta: 202, tipo: 'T', titular: true, nome: 'Titular Teste', status: true }]);
  const home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 204, name: 'reserva' }], categories: [], tags: [] },
  });
  return { api, home };
}

/** The body of the PUT the CLI sent. */
export function putBody(api: MockApi): Record<string, unknown> {
  const put = mutations(api).find((r) => r.method === 'PUT');
  if (!put) throw new Error('no PUT was sent');
  return put.body as Record<string, unknown>;
}
