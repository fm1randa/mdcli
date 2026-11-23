import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE } from './fixtures.js';
import { entryAnswer } from './entry-routes.js';
import type { Entry } from '../src/types/index.js';

// Issue #334: editing an entry linked to a savings goal must keep the link.
// The web app (md.js) loads a transfer with metaEconomiaOrigem on the origin
// half and metaEconomiaDestino on the destination half, falling back to
// metaEconomia, and sends both on save; an expense or income keeps its
// metaEconomia.

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  home = createHome({
    ...MANUAL_AUTH,
    aliases: { accounts: [{ id: 201, name: 'conta' }], categories: [], tags: [] },
  });
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const transfer = {
  descricao: 'Meta Teste',
  tipo: 't',
  data: '2026-01-15',
  dataPrevista: '2026-01-15',
  dataEfetiva: '2026-01-15',
  status: 'conciliado',
  conciliado: true,
  categoria: 30,
  tags: [],
  observacoes: '',
} as const;

const answer = { descricao: 'Meta Teste', valor: -500, data: '2026-01-15', status: 'conciliado' } as const;

async function putBody(id: number, entry: Entry): Promise<Record<string, unknown>> {
  api.on(`GET /v1/lancamentos/${id}`, entry);
  api.on(`PUT /v1/lancamentos/${id}`, entryAnswer(id, answer));
  const result = await runCli(['entries', 'update', String(id), '-n', 'via CLI', '--json'], { home, api });
  expect(result.exitCode).toBe(0);
  return mutations(api)[0].body as Record<string, unknown>;
}

describe('entries update keeps the savings goal link (#334)', () => {
  test('a deposit edited from its destination half keeps metaEconomiaDestino', async () => {
    const body = await putBody(70, {
      ...transfer, id: 70, valor: 500, valorT: -500, conta: 203, contaT: 201, metaEconomiaDestino: 7,
    });
    expect(body).toMatchObject({ contaOrigem: 201, contaDestino: 203, metaEconomiaDestino: 7 });
  });

  test('a deposit edited from its destination half linked by metaEconomia sends it as metaEconomiaDestino', async () => {
    const body = await putBody(71, {
      ...transfer, id: 71, valor: 500, valorT: -500, conta: 203, contaT: 201, metaEconomia: 7,
    });
    expect(body).toMatchObject({ contaOrigem: 201, contaDestino: 203, metaEconomiaDestino: 7 });
  });

  test('a withdrawal edited from its origin half keeps metaEconomiaOrigem', async () => {
    const body = await putBody(72, {
      ...transfer, id: 72, valor: -500, valorT: 500, conta: 203, contaT: 201, metaEconomiaOrigem: 8,
    });
    expect(body).toMatchObject({ contaOrigem: 203, contaDestino: 201, metaEconomiaOrigem: 8 });
  });

  test('a withdrawal edited from its origin half linked by metaEconomia sends it as metaEconomiaOrigem', async () => {
    const body = await putBody(73, {
      ...transfer, id: 73, valor: -500, valorT: 500, conta: 203, contaT: 201, metaEconomia: 8,
    });
    expect(body).toMatchObject({ contaOrigem: 203, contaDestino: 201, metaEconomiaOrigem: 8 });
  });

  test('a withdrawal edited from its destination half keeps metaEconomiaOrigem', async () => {
    const body = await putBody(74, {
      ...transfer, id: 74, valor: 500, valorT: -500, conta: 201, contaT: 203, metaEconomiaOrigem: 8,
    });
    expect(body).toMatchObject({ contaOrigem: 203, contaDestino: 201, metaEconomiaOrigem: 8 });
  });

  test('an expense linked to a goal keeps metaEconomia instead of sending null', async () => {
    const body = await putBody(75, {
      id: 75,
      descricao: 'Despesa Teste',
      tipo: 'd',
      valor: -40,
      data: '2026-01-15',
      dataPrevista: '2026-01-15',
      status: 'confirmado',
      conta: 201,
      categoria: 10,
      tags: [],
      metaEconomia: 9,
    });
    expect(body).toMatchObject({ id: 75, tipo: 'd', metaEconomia: 9 });
  });
});
