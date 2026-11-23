import { describe, expect, test } from 'bun:test';
import { buildEntryStatus } from '../src/commands/entries/status.js';

describe('entry status phase', () => {
  test('create with no flag reconciles and sets the effective fields', () => {
    expect(buildEntryStatus({})).toEqual({
      confirmado: true,
      conciliado: true,
      effective: 'set',
      explicit: false,
    });
  });

  test('create --pending clears Confirmado, Conciliado, and the effective fields', () => {
    expect(buildEntryStatus({ pending: true })).toEqual({
      confirmado: false,
      conciliado: false,
      effective: 'clear',
      explicit: true,
    });
  });

  test('create --confirmed sets Confirmado, leaves Conciliado off, and sets the effective fields', () => {
    expect(buildEntryStatus({ confirmed: true })).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'set',
      explicit: true,
    });
  });

  test('create --reconciled reconciles and sets the effective fields', () => {
    expect(buildEntryStatus({ reconciled: true })).toEqual({
      confirmado: true,
      conciliado: true,
      effective: 'set',
      explicit: true,
    });
  });

  test('update with no flag keeps a pending entry unconfirmed and keeps its effective fields', () => {
    expect(buildEntryStatus({}, { existing: { status: 'pendente', conciliado: false } })).toEqual({
      confirmado: false,
      conciliado: false,
      effective: 'keep',
      explicit: false,
    });
  });

  test('update with no flag keeps a scheduled entry unconfirmed and keeps its effective fields', () => {
    expect(buildEntryStatus({}, { existing: { status: 'agendado', conciliado: false } })).toEqual({
      confirmado: false,
      conciliado: false,
      effective: 'keep',
      explicit: false,
    });
  });

  test('update with no flag keeps a confirmed entry confirmed', () => {
    expect(buildEntryStatus({}, { existing: { status: 'confirmado', conciliado: false } })).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'set',
      explicit: false,
    });
  });

  test('update with no flag keeps a reconciled entry reconciled', () => {
    expect(buildEntryStatus({}, { existing: { status: 'conciliado', conciliado: true } })).toEqual({
      confirmado: true,
      conciliado: true,
      effective: 'set',
      explicit: false,
    });
  });

  test('update with no flag keeps nconciliado confirmed and unreconciled', () => {
    expect(buildEntryStatus({}, { existing: { status: 'nconciliado', conciliado: false } })).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'set',
      explicit: false,
    });
  });

  test('update --pending clears a reconciled entry', () => {
    expect(buildEntryStatus(
      { pending: true },
      { existing: { status: 'conciliado', conciliado: true } },
    )).toEqual({
      confirmado: false,
      conciliado: false,
      effective: 'clear',
      explicit: true,
    });
  });

  test('update --confirmed confirms a pending entry', () => {
    expect(buildEntryStatus(
      { confirmed: true },
      { existing: { status: 'pendente', conciliado: false } },
    )).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'set',
      explicit: true,
    });
  });

  test('update --reconciled reconciles a pending entry', () => {
    expect(buildEntryStatus(
      { reconciled: true },
      { existing: { status: 'pendente', conciliado: false } },
    )).toEqual({
      confirmado: true,
      conciliado: true,
      effective: 'set',
      explicit: true,
    });
  });

  test('a card create with one flag stays unreconciled and has no effective date', () => {
    expect(buildEntryStatus({ pending: true }, { isCard: true })).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'clear',
      explicit: true,
    });
    expect(buildEntryStatus({}, { isCard: true })).toEqual({
      confirmado: true,
      conciliado: false,
      effective: 'clear',
      explicit: false,
    });
  });

  test('pending together with confirmed is not a status', () => {
    expect(() => buildEntryStatus({ pending: true, confirmed: true })).toThrow(
      'Use only one of pending, confirmed and reconciled.',
    );
  });
});
