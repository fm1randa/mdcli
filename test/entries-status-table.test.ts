import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, SAVINGS_ACCOUNT } from './fixtures.js';

// Flag -> payload table for the entry status (Jardinagem 2026-10-19: the rule
// was written by hand in create, update and update-transfer). Semantics from
// #79: -p = Confirmado off, --confirmed = confirmed not reconciled, create
// reconciles by default, a card purchase is never reconciled.
let api: MockApi;
let home: TestHome;

const ABSENT = '<absent>';
const FIELDS = ['status', 'confirmado', 'conciliado', 'dataEfetiva', 'valorEfetivo', 'valorEfetivoT'] as const;

function statusFields(body: unknown): Record<string, unknown> {
  const sent = body as Record<string, unknown>;
  return Object.fromEntries(FIELDS.map((f) => [f, f in sent ? sent[f] : ABSENT]));
}

async function sentStatus(args: string[]): Promise<Record<string, unknown>> {
  const result = await runCli(args, { home, api });
  expect(result.exitCode).toBe(0);
  const sent = mutations(api);
  expect(sent).toHaveLength(1);
  return statusFields(sent[0].body);
}

const base = {
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  valorPrevisto: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  conta: 1001,
  categoria: 10,
  tags: [],
};
const ENTRIES: Record<number, object> = {
  71: { ...base, id: 71, status: 'conciliado', conciliado: true, dataEfetiva: '2026-01-12', valorEfetivo: -12.5 },
  72: { ...base, id: 72, status: 'confirmado', conciliado: false, dataEfetiva: '2026-01-12', valorEfetivo: -12.5 },
  73: { ...base, id: 73, status: 'agendado', conciliado: false, data: '2027-01-25', dataPrevista: '2027-01-25' },
  74: {
    ...base,
    id: 74,
    tipo: 't',
    valor: -500,
    valorT: 500,
    contaT: 1004,
    status: 'conciliado',
    conciliado: true,
    dataEfetiva: '2026-01-05',
    valorEfetivo: -500,
  },
  75: { ...base, id: 75, tipo: 't', valor: -500, valorT: 500, contaT: 1004, status: 'pendente', conciliado: false },
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', (req) => ({ id: 9, ...(req.body as object) }));
  for (const [id, entry] of Object.entries(ENTRIES)) {
    api.on(`GET /v1/lancamentos/${id}`, entry);
    api.on(`PUT /v1/lancamentos/${id}`, (req) => ({ ...entry, ...(req.body as object) }));
  }
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const CREATE = ['entries', 'create', '-a', '1001', '-d', 'Feira', '-v', '30', '-c', '10', '-D', '2026-01-05'];
const CREATE_CARD = ['entries', 'create', '-a', '1002', '-d', 'Voo', '-v', '30', '-c', '10', '-D', '2026-01-05', '--invoice', '2026-01'];

const RECONCILED = { status: { confirmado: true, conciliado: true }, confirmado: ABSENT, conciliado: true };
const CONFIRMED = { status: { confirmado: true, conciliado: false }, confirmado: ABSENT, conciliado: false };
const UNCONFIRMED = { status: { confirmado: false, conciliado: false }, confirmado: ABSENT, conciliado: false };
const NO_T = { valorEfetivoT: ABSENT };

const table: Array<[string, string[], Record<string, unknown>]> = [
  ['create (no flag) reconciles', CREATE, { ...RECONCILED, dataEfetiva: '2026-01-05', valorEfetivo: -30, ...NO_T }],
  ['create --confirmed', [...CREATE, '--confirmed'], { ...CONFIRMED, dataEfetiva: '2026-01-05', valorEfetivo: -30, ...NO_T }],
  ['create -p', [...CREATE, '-p'], { ...UNCONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],
  ['create --scheduled (alias of -p)', [...CREATE, '--scheduled'], { ...UNCONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],
  ['create on a card', CREATE_CARD, { ...CONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],
  ['create on a card -p (ignored)', [...CREATE_CARD, '-p'], { ...CONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],
  ['create on a card --confirmed (ignored)', [...CREATE_CARD, '--confirmed'], { ...CONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],

  ['update reconciled (no flag)', ['entries', 'update', '71', '-d', 'X'], { ...RECONCILED, dataEfetiva: '2026-01-12', valorEfetivo: -12.5, ...NO_T }],
  ['update reconciled -p', ['entries', 'update', '71', '-p'], { ...UNCONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],
  ['update reconciled --confirmed', ['entries', 'update', '71', '--confirmed'], { ...CONFIRMED, dataEfetiva: '2026-01-12', valorEfetivo: -12.5, ...NO_T }],
  ['update confirmed (no flag)', ['entries', 'update', '72', '-d', 'X'], { ...CONFIRMED, dataEfetiva: '2026-01-12', valorEfetivo: -12.5, ...NO_T }],
  ['update confirmed -r', ['entries', 'update', '72', '-r'], { ...RECONCILED, dataEfetiva: '2026-01-12', valorEfetivo: -12.5, ...NO_T }],
  ['update scheduled (no flag) stays unconfirmed', ['entries', 'update', '73', '-d', 'X'], { ...UNCONFIRMED, dataEfetiva: ABSENT, valorEfetivo: ABSENT, ...NO_T }],
  ['update scheduled --confirmed', ['entries', 'update', '73', '--confirmed'], { ...CONFIRMED, dataEfetiva: '2027-01-25', valorEfetivo: -12.5, ...NO_T }],
  ['update scheduled -r', ['entries', 'update', '73', '-r'], { ...RECONCILED, dataEfetiva: '2027-01-25', valorEfetivo: -12.5, ...NO_T }],
  ['update scheduled -p', ['entries', 'update', '73', '-p'], { ...UNCONFIRMED, dataEfetiva: null, valorEfetivo: null, ...NO_T }],

  ['update transfer (no flag)', ['entries', 'update', '74', '-d', 'X'], { ...RECONCILED, confirmado: true, dataEfetiva: '2026-01-05', valorEfetivo: -500, valorEfetivoT: 500 }],
  ['update transfer -p', ['entries', 'update', '74', '-p'], { ...UNCONFIRMED, confirmado: false, dataEfetiva: null, valorEfetivo: null, valorEfetivoT: null }],
  ['update transfer --confirmed', ['entries', 'update', '74', '--confirmed'], { ...CONFIRMED, confirmado: true, dataEfetiva: '2026-01-05', valorEfetivo: -500, valorEfetivoT: 500 }],
  ['update transfer -r', ['entries', 'update', '75', '-r'], { ...RECONCILED, confirmado: true, dataEfetiva: '2026-01-12', valorEfetivo: -500, valorEfetivoT: 500 }],
  ['update pending transfer (no flag) stays unconfirmed', ['entries', 'update', '75', '-d', 'X'], { ...UNCONFIRMED, confirmado: false, dataEfetiva: ABSENT, valorEfetivo: ABSENT, valorEfetivoT: ABSENT }],
];

describe('entry status payload', () => {
  for (const [name, args, expected] of table) {
    test(name, async () => {
      expect(await sentStatus(args)).toEqual(expected);
    });
  }
});
