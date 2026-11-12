import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildEntryStatus } from '../src/commands/entries/status.js';
import { moveEntry } from '../src/commands/entries/update-account.js';
import type { Entry, UpdateEntryPayload } from '../src/types/index.js';
import { mutations, runCli, type MockApi, type TestHome } from './helpers.js';
import { serveEntry } from './entry-routes.js';
import { FIXED_OCCURRENCE, putBody as sentPut, startUpdateAccountApi } from './update-account-harness.js';

const cardCreate = {
  confirmado: true,
  conciliado: false,
  effective: 'clear' as const,
};

describe('card purchase phase', () => {
  test('a card create with no flag is unreconciled and has no effective date', () => {
    expect(buildEntryStatus({}, { isCard: true })).toEqual({ ...cardCreate, explicit: false });
  });

  test('a card create ignores --pending and stays unreconciled', () => {
    expect(buildEntryStatus({ pending: true }, { isCard: true })).toEqual({ ...cardCreate, explicit: true });
  });

  test('a card create ignores --confirmed and stays unreconciled', () => {
    expect(buildEntryStatus({ confirmed: true }, { isCard: true })).toEqual({ ...cardCreate, explicit: true });
  });

  test('a card create ignores --reconciled and stays unreconciled', () => {
    expect(buildEntryStatus({ reconciled: true }, { isCard: true })).toEqual({ ...cardCreate, explicit: true });
  });

  test('pending together with confirmed is not a card purchase', () => {
    expect(() => buildEntryStatus({ pending: true, confirmed: true }, { isCard: true })).toThrow(
      'Use only one of pending, confirmed and reconciled.',
    );
  });

  test('a move cannot ask for pending and confirmed at once', async () => {
    const previous = process.env.MDCLI_CONFIG_DIR;
    process.env.MDCLI_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'mdcli-card-phase-'));
    const payload = { status: { confirmado: false, conciliado: false } } as UpdateEntryPayload;
    const existing = { conta: 201, status: 'confirmado', conciliado: false } as Entry;
    try {
      await expect(moveEntry(payload, existing, 202, {
        flags: { pending: true, confirmed: true },
      })).rejects.toThrow('Use only one of pending, confirmed and reconciled.');
    } finally {
      if (previous === undefined) delete process.env.MDCLI_CONFIG_DIR;
      else process.env.MDCLI_CONFIG_DIR = previous;
    }
  });
});

describe('card purchase move', () => {
  let api: MockApi;
  let home: TestHome;

  beforeEach(() => {
    ({ api, home } = startUpdateAccountApi());
  });

  afterEach(() => {
    api.stop();
    home.cleanup();
  });

  test('onto a card, an unreconciled entry is unreconciled on both flags', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', '202', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPut(api)).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
      dataEfetiva: null,
    });
  });

  test('onto a card, --pending is ignored and the purchase stays unreconciled', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', '202', '--pending'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('--pending was ignored');
    expect(sentPut(api)).toMatchObject({
      status: { confirmado: false, conciliado: false },
      conciliado: false,
    });
  });

  test('onto a card, --confirmed is ignored and the purchase stays unreconciled', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', '202', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('--confirmed was ignored');
    expect(sentPut(api)).toMatchObject({ status: { confirmado: false, conciliado: false } });
  });

  test('onto a card, --reconciled is refused', async () => {
    const result = await runCli(['entries', 'update', '70', '--account', '202', '--reconciled'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('does not reconcile card purchases');
    expect(mutations(api)).toEqual([]);
  });

  test('onto a card, a reconciled endless series stays reconciled and keeps the purchase date', async () => {
    serveEntry(api, {
      ...FIXED_OCCURRENCE,
      id: 82,
      data: '2026-01-05',
      dataPrevista: '2026-01-05',
      dataEfetiva: '2026-01-05',
      valorEfetivo: -45,
      status: 'conciliado',
      conciliado: true,
    });

    const result = await runCli(['entries', 'update', '82', '--account', '202', '--scope', 'following'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPut(api)).toMatchObject({
      status: { confirmado: true, conciliado: true },
      dataEfetiva: '2026-01-05',
    });
  });

  test('off a card, an unreconciled purchase becomes unconfirmed', async () => {
    const result = await runCli(['entries', 'update', '90', '--account', '201'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPut(api)).toMatchObject({
      status: { confirmado: false, conciliado: false },
      dataEfetiva: null,
    });
  });

  test('off a card, --confirmed confirms the purchase', async () => {
    const result = await runCli(['entries', 'update', '90', '--account', '201', '--confirmed'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(sentPut(api)).toMatchObject({
      status: { confirmado: true, conciliado: false },
      dataEfetiva: '2026-01-05',
    });
  });
});
