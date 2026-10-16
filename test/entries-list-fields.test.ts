import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, EMPTY_ENTRIES_RESPONSE, SAVINGS_ACCOUNT, TAGS_RESPONSE, entriesPage } from './fixtures.js';

let api: MockApi;
let home: TestHome;

// A card installment as the API lists it: purchase date in data, invoice due
// date in dataPrevista.
const installment = {
  id: 61,
  descricao: 'Notebook',
  tipo: 'd',
  valor: -250,
  data: '2026-01-03',
  dataPrevista: '2026-01-16',
  dataEfetiva: '2026-01-16T00:00:00',
  dataCompetencia: '2026-01-03',
  status: 'confirmado',
  conta: 1001,
  categoria: 10,
  parcela: '2/6',
  agendaId: 99,
  tags: [501, 502],
  observacoes: 'em 6x',
  ndocumento: 'NF-1',
};

const transfer = {
  id: 62,
  descricao: 'Reserva',
  tipo: 't',
  valor: -500,
  data: '2026-01-20',
  dataPrevista: '2026-01-20',
  status: 'pendente',
  conta: 1001,
  contaT: 1004,
  categoria: 30,
  parcela: 'fixa',
  agendaId: 7,
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [...ACCOUNTS_RESPONSE.items, SAVINGS_ACCOUNT] });
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/cadastros/tags', TAGS_RESPONSE);
  api.on('GET /v2/lancamentos', entriesPage([installment, transfer]));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const LIST = ['entries', 'list', '-a', '1001', '-f', '2026-01-01', '-t', '2026-01-31'];

function listQuery(): URLSearchParams {
  const request = api.requests.find((r) => r.path === '/v2/lancamentos');
  if (!request) throw new Error('entries endpoint was not called');
  return request.query;
}

describe('entries list fields', () => {
  test('--json carries the planned date and the fields the web export has', async () => {
    const result = await runCli([...LIST, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const [first, second] = JSON.parse(result.stdout);
    expect(first).toEqual({
      id: 61,
      description: 'Notebook',
      date: '2026-01-16',
      value: -250,
      type: 'expense',
      status: 'confirmed',
      accountId: 1001,
      categoryId: 10,
      installment: '2/6',
      repetition: 'installment',
      seriesId: 99,
      effectiveDate: '2026-01-16',
      competenceDate: '2026-01-03',
      transferAccountId: null,
      tagIds: [501, 502],
      notes: 'em 6x',
      documentNumber: 'NF-1',
    });
    expect(second).toMatchObject({ type: 'transfer', status: 'pending', repetition: 'fixed', transferAccountId: 1004, effectiveDate: null });
  });

  test('--csv names the transfer account and the tags', async () => {
    const result = await runCli([...LIST, '--csv'], { home, api });

    expect(result.exitCode).toBe(0);
    const [header, first, second] = result.stdout.split('\r\n');
    expect(header).toBe(
      'id,date,description,value,type,status,account,category,installment,repetition,effective_date,competence_date,transfer_account,tags,notes,document_number'
    );
    expect(first).toBe('61,2026-01-16,Notebook,-250,expense,confirmed,Nubank,Alimentação,2/6,installment,2026-01-16,2026-01-03,,Trabalho; Pessoal,em 6x,NF-1');
    expect(second).toBe('62,2026-01-20,Reserva,-500,transfer,pending,Nubank,Transferência,fixa,fixed,,,Poupança Nubank,,,');
  });

  test('tells confirmed and pending apart and shows the whole Installment header', async () => {
    const result = await runCli(LIST, { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Confirmed');
    expect(result.stdout).toContain('Pending');
    expect(result.stdout).toMatch(/ Installment /);
  });
});

describe('--repetition filter', () => {
  test('sends the web app tipoRepeticao bitmask', async () => {
    const result = await runCli([...LIST, '-R', 'installment,fixed', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(listQuery().get('tipoRepeticao')).toBe('6');
  });

  test('leaves tipoRepeticao out without the flag', async () => {
    const result = await runCli([...LIST, '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(listQuery().has('tipoRepeticao')).toBe(false);
  });

  test('works on summary too and rejects unknown names before calling the API', async () => {
    api.on('GET /v2/lancamentos', EMPTY_ENTRIES_RESPONSE);
    const summary = await runCli(['entries', 'summary', '-a', '1001', '--repetition', 'single', '--json'], { home, api });
    expect(summary.exitCode).toBe(0);
    expect(listQuery().get('tipoRepeticao')).toBe('1');

    api.requests.length = 0;
    const bad = await runCli([...LIST, '-R', 'monthly'], { home, api });
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toContain('Unknown repetition: monthly');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
  });
});

describe('entries show', () => {
  test('prints every field with account, category and tag names', async () => {
    api.on('GET /v1/lancamentos/61', installment);

    const result = await runCli(['entries', 'show', '61'], { home, api });

    expect(result.exitCode).toBe(0);
    const out = result.stdout;
    expect(out).toContain('Planned date: 2026-01-16');
    expect(out).toContain('Competence date: 2026-01-03');
    expect(out).toContain('Account: Nubank');
    expect(out).toContain('Category: Alimentação');
    expect(out).toContain('Tags: Trabalho, Pessoal');
    expect(out).toContain('Repetition: Installment (2/6)');
    expect(out).toContain('Series: 99');
    expect(out).toContain('Document number: NF-1');
    expect(out).toContain('Notes: em 6x');
  });

  test('--json is the list shape and --raw is the API answer untouched', async () => {
    api.on('GET /v1/lancamentos/62', transfer);

    const json = await runCli(['entries', 'show', '62', '--json'], { home, api });
    const raw = await runCli(['entries', 'show', '62', '--raw'], { home, api });

    expect(JSON.parse(json.stdout)).toMatchObject({ id: 62, transferAccountId: 1004, repetition: 'fixed', seriesId: 7 });
    expect(JSON.parse(raw.stdout)).toEqual(transfer);
  });
});
