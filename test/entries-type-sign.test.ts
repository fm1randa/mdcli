import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Finanças report (2026-10-27): `entries create -T income -c <expense category>`
// reached the API and came back as an expense refund, and `entries update -T
// income` kept the old sign and the estorno flag. The web app's picker lists
// only categories of the entry's type and clears the category when the type
// changes (md.js, filterCats/changeTipo), and its save signs the value from the
// type and sets estorno from it (md.js, Tt and the type→{tipo,estorno} map).

let api: MockApi;
let home: TestHome;

// A refund as the server stored one: tipo r with a negative value and
// estorno on, which the web app never sends.
const refund = {
  id: 70,
  descricao: 'Estorno café',
  tipo: 'r',
  valor: -1700,
  valorPrevisto: -1700,
  valorEfetivo: -1700,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  dataEfetiva: '2026-01-12',
  status: 'conciliado',
  conciliado: true,
  estorno: true,
  conta: 1001,
  categoria: 20,
  tags: [],
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', (req) => ({ ...(req.body as object), id: 9 }));
  api.on('GET /v1/lancamentos/70', refund);
  api.on('PUT /v1/lancamentos/70', (req) => ({ ...refund, ...(req.body as object) }));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

/** The body of the only POST/PUT the command sent. */
function sentBody(): Record<string, unknown> {
  const [request] = mutations(api);
  if (!request) throw new Error('no POST/PUT was sent');
  return request.body as Record<string, unknown>;
}

const CREATE = ['entries', 'create', '-a', '1001', '-d', 'Aluguel', '-v', '1700', '-D', '2026-01-05'];

describe('entries create refuses a category of another type', () => {
  test('an income entry with an expense category exits before the POST', async () => {
    const result = await runCli([...CREATE, '-T', 'income', '-c', '10'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Alimentação" (10) is an expense, but the entry type is income');
    expect(mutations(api)).toHaveLength(0);
  });

  test('an expense entry with an income category exits before the POST', async () => {
    const result = await runCli([...CREATE, '-c', '20'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Salário" (20) is income, but the entry type is an expense');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a category of the entry type still goes to the API', async () => {
    const result = await runCli([...CREATE, '-T', 'income', '-c', '20', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ tipo: 'r', categoria: 20, valor: 1700 });
  });

  test('an ID the catalog does not list is still sent as written', async () => {
    const result = await runCli([...CREATE, '-T', 'income', '-c', '99', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ tipo: 'r', categoria: 99 });
  });
});

describe('entries update sets the sign and estorno from the type', () => {
  test('the reported case: -T income -c <income category> -v 1700 on a refund', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'income', '-c', '20', '-v', '1700'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      tipo: 'r',
      estorno: false,
      categoria: 20,
      valor: 1700,
      valorPrevisto: 1700,
      valorEfetivo: 1700,
    });
  });

  test('-v alone signs every value field from the entry type and keeps estorno', async () => {
    const result = await runCli(['entries', 'update', '70', '-v', '-1700'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      tipo: 'r',
      estorno: true,
      valor: 1700,
      valorPrevisto: 1700,
      valorEfetivo: 1700,
    });
  });

  test('a negative -v keeps the type sign, as create does', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'income', '-v', '-1700'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ tipo: 'r', valor: 1700, valorPrevisto: 1700, valorEfetivo: 1700 });
  });

  test('a category of another type moves the entry to that type, with its sign', async () => {
    const result = await runCli(['entries', 'update', '70', '-c', '10'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({
      tipo: 'd',
      estorno: false,
      categoria: 10,
      valor: -1700,
      valorPrevisto: -1700,
      valorEfetivo: -1700,
    });
  });

  test('an expense keeps its negative sign whatever sign -v has', async () => {
    const expense = { ...refund, tipo: 'd', estorno: false, categoria: 10, valor: -30, valorPrevisto: -30, valorEfetivo: -30 };
    api.on('GET /v1/lancamentos/70', expense);

    const result = await runCli(['entries', 'update', '70', '-v', '1700'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ tipo: 'd', valor: -1700, valorPrevisto: -1700, valorEfetivo: -1700 });
  });
});

describe('entries update refuses a type and a category that disagree', () => {
  test('-T that disagrees with the current category exits before the PUT', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'expense'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Salário" (20) is income, but the entry type is an expense');
    expect(mutations(api)).toHaveLength(0);
  });

  test('-c that disagrees with -T exits before the PUT', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'income', '-c', '10'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Alimentação" (10) is an expense, but the entry type is income');
    expect(mutations(api)).toHaveLength(0);
  });

  test('-T and -c that agree reach the API', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'expense', '-c', '10'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentBody()).toMatchObject({ tipo: 'd', categoria: 10, valor: -1700 });
  });
});

describe('entries refuse a type it does not know', () => {
  test('create exits before the POST', async () => {
    const result = await runCli([...CREATE, '-T', 'bogus', '-c', '10'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown type: bogus. Valid: expense, income, transfer');
    expect(mutations(api)).toHaveLength(0);
  });

  test('update exits before the PUT', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'bogus'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown type: bogus. Valid: expense, income, transfer');
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('entries update does not turn an entry into a transfer', () => {
  // A transfer is a pair of entries with two accounts, saved through its own
  // payload: once an entry carries tipo t without one, update refuses to touch
  // it again (update-transfer.ts, transferSides), so the command must not get
  // there in the first place.
  test('-T transfer exits before the PUT', async () => {
    const result = await runCli(['entries', 'update', '70', '-T', 'transfer'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('is not a transfer');
    expect(mutations(api)).toHaveLength(0);
  });

  test('a transfer category exits before the PUT', async () => {
    const result = await runCli(['entries', 'update', '70', '-c', '30'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Category "Transferência" (30) only classifies transfers');
    expect(mutations(api)).toHaveLength(0);
  });
});
