import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE, cardInvoice } from './fixtures.js';

// The contract of the two resolvers `resolveCreatedEntryId` replaced (#78,
// #166): an id that is already an entry ID comes back untouched, a card
// purchase answers an occurrence ID that the invoice resolves, and a lookup
// that finds nothing keeps the API's id and warns. These cases pin the shapes
// outside the four happy/sad paths covered by entries-card and entries-status.

let api: MockApi;
let home: TestHome;

const CARD_ACCOUNT = 1002;
const CHECKING_ACCOUNT = 1001;
const CARD_DUE = '2026-01-16';
const OCCURRENCE_ID = '46349170A2026-01-05';

const CARD_CREATE = ['entries', 'create', '-a', String(CARD_ACCOUNT), '-d', 'Voo', '-v', '10', '-c', '10', '-D', '2026-01-05', '-p'];
const SCHEDULED_CREATE = ['entries', 'create', '-a', String(CHECKING_ACCOUNT), '-d', 'IPVA', '-v', '800', '-c', '10', '-p', '-D', '2031-01-20'];

function invoice(due: string, lancamentos: unknown[] = []) {
  return { ...cardInvoice(due, `${due.slice(0, 8)}08`), lancamentos };
}

function requestsAfterPost(): string[] {
  const post = api.requests.findIndex((request) => request.method === 'POST');
  return api.requests.slice(post + 1).map((request) => `${request.method} ${request.path}`);
}

function scheduledPost(id: unknown) {
  return { id, descricao: 'IPVA', valor: -800, data: '2031-01-20', dataPrevista: '2031-01-20', status: 'agendado' };
}

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
  api.on('GET /v1/cartoes/1002/fatura/2026-01-16', invoice(CARD_DUE));
  api.on('GET /v1/cartoes/1002/fatura/2025-12-16', invoice('2025-12-16'));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries create keeps an id that is already an entry ID', () => {
  test('scheduled: a decimal-string id stays a string and the list is not read', async () => {
    api.on('POST /v1/lancamentos', scheduledPost('555'));

    const result = await runCli([...SCHEDULED_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe('555');
    expect(api.requests.some((request) => request.path === '/v2/lancamentos')).toBe(false);
  });

  test('card: a decimal-string id stays a string and the invoice is not read after the POST', async () => {
    api.on('POST /v1/lancamentos', { id: '555', descricao: 'Voo', valor: -10, data: '2026-01-05', status: 'confirmado', conta: CARD_ACCOUNT });

    const result = await runCli([...CARD_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe('555');
    expect(requestsAfterPost().some((request) => request.startsWith('GET /v1/cartoes/'))).toBe(false);
  });
});

describe('entries create looks up an id the API answered that is neither an entry ID nor an occurrence', () => {
  test('card: reads the invoice, warns, and keeps the API id when the purchase is not there', async () => {
    api.on('POST /v1/lancamentos', { id: 'abc', descricao: 'Voo', valor: -10, data: '2026-01-05', status: 'confirmado', conta: CARD_ACCOUNT });

    const result = await runCli([...CARD_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe('abc');
    expect(result.stderr).toContain('is not an entry ID');
    expect(result.stderr).toContain('mdcli cards invoice -a 1002 --month 2026-01');
    expect(requestsAfterPost()).toContain(`GET /v1/cartoes/1002/fatura/${CARD_DUE}`);
  });

  test('scheduled: leaves the API id alone without reading the list or warning', async () => {
    api.on('POST /v1/lancamentos', scheduledPost('abc'));

    const result = await runCli([...SCHEDULED_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).id).toBe('abc');
    expect(result.stderr).toBe('');
    expect(api.requests.some((request) => request.path === '/v2/lancamentos')).toBe(false);
  });
});

describe('entries create keeps the API occurrence id without occurrenceId when the lookup finds nothing', () => {
  test('scheduled', async () => {
    api.on('POST /v1/lancamentos', scheduledPost('123456A2031-01-20'));

    const result = await runCli([...SCHEDULED_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.id).toBe('123456A2031-01-20');
    expect(output).not.toHaveProperty('occurrenceId');
    expect(result.stderr).toContain('is not an entry ID');
  });

  test('card', async () => {
    api.on('POST /v1/lancamentos', { id: OCCURRENCE_ID, descricao: 'Voo', valor: -10, data: '2026-01-05', status: 'confirmado', conta: CARD_ACCOUNT });

    const result = await runCli([...CARD_CREATE, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.id).toBe(OCCURRENCE_ID);
    expect(output).not.toHaveProperty('occurrenceId');
    expect(result.stderr).toContain('is not an entry ID');
  });
});
