import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mutations, runCli, type MockApi, type TestHome } from './helpers.js';
import { CONFIRMED_ENTRY, FIXED_OCCURRENCE, TRANSFER_DESTINATION_HALF, putBody as sentPut, startUpdateAccountApi } from './update-account-harness.js';

let api: MockApi;
let home: TestHome;

beforeEach(() => {
  ({ api, home } = startUpdateAccountApi());
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

const putBody = (): Record<string, unknown> => sentPut(api);

describe('entries update --account', () => {
  test('moves this and the following occurrences of a fixed series to another account', async () => {
    const result = await runCli(['entries', 'update', '80', '--account', 'reserva', '--scope', 'following'], { home, api });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      conta: 1004,
      todos: true,
      agendaId: 77,
      parcela: 'fixa',
      dataPrevista: '2027-01-10',
      status: { confirmado: false, conciliado: false },
    });
    expect(putBody()).not.toHaveProperty('dataEfetiva');
    expect(result.stdout).toContain('Account: 1004');
    expect(result.stdout).toContain('Scope: this and the following occurrences');
  });

  test('refuses an entry on a closed invoice, as the web app locks its account', async () => {
    api.on('GET /v1/lancamentos/81', { ...FIXED_OCCURRENCE, id: 81, conta: 1002, status: 'nconciliado', fatura: 3141 });

    const result = await runCli(['entries', 'update', '81', '--account', '1001', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Entry 81 is on a closed invoice, so its account cannot be changed');
    expect(mutations(api)).toEqual([]);
  });

  test('--to-account only applies to transfers', async () => {
    const result = await runCli(['entries', 'update', '80', '--to-account', '1004', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--to-account only applies to transfers');
    expect(mutations(api)).toEqual([]);
  });

  // An invoice payment pays Cartão Azul (1002) from Nubank (1001). The web
  // app edits it as a transfer, and transfers involving a card are refused.
  for (const option of ['--account', '--to-account']) {
    test(`refuses ${option} on an invoice payment, which always involves a credit card`, async () => {
      api.on('GET /v1/lancamentos/95', { ...TRANSFER_DESTINATION_HALF, id: 95, tipo: 'p', conta: 1001, contaT: 1002, transferencia: 9 });

      const result = await runCli(['entries', 'update', '95', option, '1006'], { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('invoice payment involves a credit card');
      expect(mutations(api)).toEqual([]);
    });
  }
});

describe('entries update --account between regular accounts, as the web edit form saves', () => {
  test('the competence date becomes the recognition date', async () => {
    api.on('GET /v1/lancamentos/71', { ...CONFIRMED_ENTRY, id: 71, dataCompetencia: '2026-01-01', dataReconhecimento: '2026-01-03' });
    api.on('PUT /v1/lancamentos/71', (req) => req.body as object);

    const result = await runCli(['entries', 'update', '71', '-a', '1004'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ conta: 1004, dataCompetencia: '2026-01-03' });
  });

  test('the competence date is sent as a calendar day', async () => {
    api.on('GET /v1/lancamentos/71', { ...CONFIRMED_ENTRY, id: 71, dataReconhecimento: '2026-01-03T00:00:00' });
    api.on('PUT /v1/lancamentos/71', (req) => req.body as object);

    const result = await runCli(['entries', 'update', '71', '-a', '1004'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ dataCompetencia: '2026-01-03' });
  });

  test('a pending entry dated up to today no longer confirms itself automatically', async () => {
    api.on('GET /v1/lancamentos/72', {
      ...CONFIRMED_ENTRY,
      id: 72,
      status: 'pendente',
      dataEfetiva: null,
      valorEfetivo: null,
      automatico: true,
    });
    api.on('PUT /v1/lancamentos/72', (req) => req.body as object);

    const result = await runCli(['entries', 'update', '72', '-a', '1004'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ status: { confirmado: false, conciliado: false }, automatico: false });
  });

  test('refuses an inactive account, which the web app does not offer', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', 'Antiga'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Account "Antiga" (1007) is inactive');
    expect(mutations(api)).toEqual([]);
  });

  test('a scheduled entry keeps confirming itself automatically', async () => {
    // Far enough ahead that it stays scheduled whenever the suite runs.
    api.on('GET /v1/lancamentos/80', { ...FIXED_OCCURRENCE, data: '2099-01-10', dataPrevista: '2099-01-10', automatico: true });

    const result = await runCli(['entries', 'update', '80', '-a', '1004', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ automatico: true });
  });
});

describe('entries update --account on a transfer', () => {
  test('--account moves the origin and --to-account the destination', async () => {
    const result = await runCli(['entries', 'update', '51', '--account', 'Inter', '--to-account', '1001', '--json'], { home, api });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      transferencia: true,
      contaOrigem: 1006,
      contaDestino: 1001,
      conta: 1006,
      contaT: 1001,
      valor: -300,
      valorT: 300,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({ conta: 1006, contaT: 1001 });
  });

  test('--to-account alone keeps the origin', async () => {
    const result = await runCli(['entries', 'update', '51', '--to-account', 'Inter'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ contaOrigem: 1001, contaDestino: 1006 });
    expect(result.stdout).toContain('To account: 1006');
  });

  test('refuses the same account on both sides, as the web app does', async () => {
    const result = await runCli(['entries', 'update', '51', '--account', 'reserva'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('origin and destination would both be account 1004');
    expect(mutations(api)).toEqual([]);
  });

  test('refuses moving either side to a credit card', async () => {
    const result = await runCli(['entries', 'update', '51', '--to-account', '1002'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Transfers to or from a credit card account are not supported');
    expect(mutations(api)).toEqual([]);
  });

  test('refuses moving either side to an inactive account', async () => {
    for (const option of ['--account', '--to-account']) {
      const result = await runCli(['entries', 'update', '51', option, '1007'], { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Account "Antiga" (1007) is inactive');
    }
    expect(mutations(api)).toEqual([]);
  });
});
