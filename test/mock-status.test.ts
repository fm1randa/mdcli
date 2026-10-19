import { describe, expect, test } from 'bun:test';
import { statusLabel } from '../scripts/mock-entries.js';

// Jardinagem 2026-10-19: the verify mock labelled the same status payload
// differently on POST and PUT. Both now go through statusLabel.
describe('mock statusLabel', () => {
  const cases: Array<[string, Record<string, unknown>, Record<string, unknown> | undefined, string | undefined]> = [
    ['reconciled', { status: { confirmado: true, conciliado: true }, dataEfetiva: '2026-01-05' }, undefined, 'conciliado'],
    ['confirmed with effective date', { status: { confirmado: true, conciliado: false }, dataEfetiva: '2026-01-05' }, undefined, 'confirmado'],
    ['confirmed without effective date (card)', { status: { confirmado: true, conciliado: false }, dataEfetiva: null }, undefined, 'confirmado'],
    ['unconfirmed, past date', { status: { confirmado: false, conciliado: false }, dataEfetiva: null, dataPrevista: '2026-01-05' }, undefined, 'pendente'],
    ['unconfirmed, future date', { status: { confirmado: false, conciliado: false }, dataEfetiva: null, dataPrevista: '2099-01-05' }, undefined, 'agendado'],
    [
      'PUT keeping an existing effective date confirms',
      { status: { confirmado: false, conciliado: false } },
      { dataEfetiva: '2026-01-05', dataPrevista: '2026-01-05' },
      'confirmado',
    ],
    ['no status object', { descricao: 'X' }, undefined, undefined],
  ];
  for (const [name, payload, stored, expected] of cases) {
    test(name, () => {
      expect(statusLabel(payload, stored ?? payload)).toBe(expected);
    });
  }
});
