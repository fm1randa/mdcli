import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE, CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT } from './fixtures.js';
import { SINCE } from './import-harness.js';

// Cartão Azul is 1002, proximoVencimento 2026-01-16T00:00:00. Connection account 9002 is not that id.
const CARD_LINK = [
  { id: 501, status: 'UPDATED', accounts: [{ id: 9002, type: 'CONTA CORRENTE', conta: 1002 }] },
];
const TX = '56565656-1111-4000-8000-000000000001';
const INVOICE = '/v1/cartoes/1002/fatura/2026-01-16';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/integracao/connections', CARD_LINK);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('GET /v1/lancamentos/duplicidade', {});
  api.on('GET /v1/integracao/account/9002/transactions', {
    inicio: '2026-10-01',
    fim: '2026-10-10',
    saldo: 0,
    lancamentos: [{
      integrationId: TX,
      descricao: 'Compra no cartao',
      valor: -12.34,
      data: '2026-10-07',
      moeda: 1,
      ndocumento: 'DOC-1',
      _ca: { c: { d: { categoria: { v: 10 } } } },
    }],
  });
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function cli(args: string[]) {
  return runCli(args, { home, api });
}

function list(args: string[] = []) {
  return cli(['entries', 'import', 'list', '-a', '1002', '--since', SINCE, '--json', ...args]);
}

function invoice(items: unknown[]) {
  api.on(`GET ${INVOICE}`, {
    lancamentos: items,
    vencimento: '2026-01-16',
    fechamento: '2026-01-08',
    valor: -12.34,
  });
}

describe('entries import list card candidates', () => {
  test('matches the invoice dataCompetencia, not the purchase date or dataPrevista, like the web', async () => {
    invoice([
      {
        id: 777, descricao: 'Compra Ficticia', valor: -12.34, data: '2026-01-01',
        dataPrevista: '2026-01-16', dataCompetencia: '2026-10-08', categoria: 10,
      },
      {
        id: 778, descricao: 'So Compra', valor: -12.34, data: '2026-10-07',
        dataCompetencia: '2026-01-02', dataPrevista: '2026-10-07', categoria: 11,
      },
      {
        id: 780, descricao: 'Sinal Trocado', valor: 12.34, dataCompetencia: '2026-10-07', categoria: 20,
      },
    ]);
    api.on('GET /v1/lancamentos/duplicidade', { '2026-10-07': [{ id: 77, valor: -12.34 }] });

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout);
    expect(body.search).toEqual({ from: null, to: null });
    expect(body.ai).toBe('unused');
    expect(body.transactions[0].duplicateOf).toBe(77);
    expect(body.transactions[0].conciliateWith).toBe(777);
    expect(body.transactions[0].defaultAction).toBe('conciliate');
    expect(body.transactions[0].candidates).toEqual([
      { id: 778, date: '2026-01-02', value: -12.34, description: 'So Compra', categoryId: 11 },
      { id: 777, date: '2026-10-08', value: -12.34, description: 'Compra Ficticia', categoryId: 10 },
    ]);
    expect(api.requests.some((r) => r.path === INVOICE)).toBe(true);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(api.requests.some((r) => r.path.includes('primeiraFatura'))).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });

  test('lists an invoice item more than two days away without conciliating', async () => {
    invoice([
      { id: 781, descricao: 'Longe', valor: -12.34, data: '2026-10-07', dataCompetencia: '2026-10-04', categoria: 10 },
    ]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.candidates).toEqual([
      { id: 781, date: '2026-10-04', value: -12.34, description: 'Longe', categoryId: 10 },
    ]);
    expect(row.conciliateWith).toBeNull();
    expect(row.defaultAction).toBe('import');
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
  });

  test('lists the whole invoice, even an item well before the statement, and a plan may conciliate it', async () => {
    invoice([
      { id: 783, descricao: 'Antes do extrato', valor: -12.34, dataCompetencia: '2026-09-22', categoria: 10 },
    ]);

    const listed = await list();

    expect(listed.exitCode).toBe(0);
    const row = JSON.parse(listed.stdout).transactions[0];
    expect(row.candidates).toEqual([
      { id: 783, date: '2026-09-22', value: -12.34, description: 'Antes do extrato', categoryId: 10 },
    ]);
    expect(row.conciliateWith).toBeNull();

    const plan = join(home.dir, 'plan.json');
    writeFileSync(plan, JSON.stringify({ transactions: [{ id: TX.slice(0, 8), action: 'conciliate', entry: 783 }] }));
    const result = await cli(['entries', 'import', 'run', '-a', '1002', '--since', SINCE, '--plan', plan, '--dry-run', '--json']);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).conciliated).toEqual([expect.objectContaining({ integrationId: TX, entryId: 783 })]);
    expect(mutations(api)).toHaveLength(0);
  });

  test('lists invoice candidates when the statement has no period', async () => {
    api.on('GET /v1/integracao/account/9002/transactions', {
      saldo: 0,
      lancamentos: [{ integrationId: TX, descricao: 'Compra no cartao', valor: -12.34, data: '2026-10-07', moeda: 1 }],
    });
    invoice([{ id: 784, descricao: 'Sem periodo', valor: -12.34, dataCompetencia: '2026-10-07', categoria: 10 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.candidates).toEqual([
      { id: 784, date: '2026-10-07', value: -12.34, description: 'Sem periodo', categoryId: 10 },
    ]);
    expect(row.conciliateWith).toBe(784);
  });

  test('reads a dataCompetencia that carries a time', async () => {
    invoice([
      { id: 782, descricao: 'Com hora', valor: -12.34, dataCompetencia: '2026-10-06T00:00:00', dataPrevista: '2026-01-16T00:00:00', categoria: 10 },
    ]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    const row = JSON.parse(result.stdout).transactions[0];
    expect(row.candidates).toEqual([
      { id: 782, date: '2026-10-06', value: -12.34, description: 'Com hora', categoryId: 10 },
    ]);
    expect(row.defaultAction).toBe('conciliate');
  });

  test('rejects --search-from or --search-to on a card as not specified', async () => {
    invoice([]);
    for (const args of [['--search-from', '2026-09-01'], ['--search-to', '2026-10-20']]) {
      api.requests.length = 0;
      const result = await list(args);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('not specified');
      expect(JSON.parse(result.stderr).error).toContain('not specified');
      expect(api.requests.some((r) => r.path === INVOICE || r.path.includes('/fatura'))).toBe(false);
      expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    }
    expect(mutations(api)).toHaveLength(0);
  });

  test('fails when proximoVencimento is missing or not a calendar date, without loading any invoice', async () => {
    const { proximoVencimento: _omit, ...withoutDue } = CREDIT_CARD_ACCOUNT;
    api.on('GET /v1/cartoes/1002/primeiraFatura', () => '2026-02-21T00:00:00');
    const cards = [withoutDue, { ...CREDIT_CARD_ACCOUNT, proximoVencimento: '2026-02-31T00:00:00' }];
    for (const card of cards) {
      api.requests.length = 0;
      api.on('GET /v1/cadastros/contas', { ...ACCOUNTS_RESPONSE, items: [CHECKING_ACCOUNT, card] });
      const result = await list();
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr).error).toContain('proximoVencimento');
      expect(api.requests.some((r) => r.path.includes('primeiraFatura'))).toBe(false);
      expect(api.requests.some((r) => r.path.includes('/fatura'))).toBe(false);
      expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    }
    expect(mutations(api)).toHaveLength(0);
  });

  test('does not load an invoice when the card statement is empty', async () => {
    api.on('GET /v1/integracao/account/9002/transactions', {
      inicio: '2026-10-01', fim: '2026-10-10', saldo: 0, lancamentos: [],
    });
    invoice([{ id: 777, descricao: 'Compra Ficticia', valor: -12.34, data: '2026-10-08', categoria: 10 }]);

    const result = await list();

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).transactions).toEqual([]);
    expect(api.requests.some((r) => r.path === INVOICE)).toBe(false);
    expect(api.requests.some((r) => r.path === '/v2/lancamentos')).toBe(false);
    expect(mutations(api)).toHaveLength(0);
  });
});
