import { describe, expect, test } from 'bun:test';
import { planRun } from '../src/commands/entries/import/plan.js';
import type { BankTransactionRow, ImportDocument } from '../src/commands/entries/import/document.js';
import type { ImportCandidate } from '../src/commands/entries/import/candidates.js';
import type { Category } from '../src/types/index.js';

const today = '2026-01-05';

const market: Category = {
  id: 10,
  nome: 'Mercado',
  nomeRel: 'Mercado',
  tipo: 'd',
  status: true,
  permissoes: { visivel: true, acoes: { editar: true, excluir: true } },
  _ordenacao: '1',
  sistema: false,
};

function statement(): ImportDocument {
  return {
    account: { id: 201, name: 'Conta Teste' },
    connection: { id: 1, connectionAccount: 9 },
    source: 'statement',
    since: '2026-01-01',
    statement: { start: '2026-01-01', end: '2026-01-31', balance: 0 },
    search: { from: '2025-12-30', to: '2026-02-02' },
    ai: 'unused',
    transactions: [],
  };
}

function bankRow(overrides: Partial<BankTransactionRow> = {}): BankTransactionRow {
  return {
    id: 'pad',
    action: 'import',
    category: '10',
    value: -12.5,
    description: 'Padaria',
    entry: null,
    integrationId: 'padaria-1',
    date: today,
    bankDescription: 'Padaria',
    suggestedDescription: null,
    suggestedTagIds: [],
    suggestedCategory: null,
    duplicateOf: null,
    alreadyConciliated: false,
    candidates: [],
    ...overrides,
  };
}

function candidate(id: number): ImportCandidate {
  return { id, date: today, value: -12.5, description: 'Padaria', categoryId: 10 };
}

function selection(toImport: BankTransactionRow[], rejects: BankTransactionRow[] = [], includeDuplicates = false) {
  return {
    toImport,
    rejects,
    category: market,
    includeDuplicates,
    today,
    dryRun: true,
  };
}

describe('import row disposition', () => {
  test('a row dated today or earlier is imported reconciled', () => {
    const run = planRun(statement(), selection([bankRow()]));

    expect(run.imported).toEqual([
      expect.objectContaining({ integrationId: 'padaria-1', status: 'reconciled', categoryId: 10 }),
    ]);
    expect(run.conciliated).toHaveLength(0);
    expect(run.rejected).toHaveLength(0);
    expect(run.skipped).toHaveLength(0);
  });

  test('a row dated after today is imported scheduled', () => {
    const run = planRun(statement(), selection([bankRow({ date: '2026-02-01', integrationId: 'futuro-1', id: 'fut' })]));

    expect(run.imported).toEqual([
      expect.objectContaining({ integrationId: 'futuro-1', status: 'scheduled' }),
    ]);
  });

  test('a linked row is conciliated and not imported', () => {
    const row = bankRow({
      action: 'conciliate',
      entry: 7,
      candidates: [candidate(7)],
    });
    const run = planRun(statement(), selection([row]));

    expect(run.conciliated).toEqual([
      expect.objectContaining({ integrationId: 'padaria-1', entryId: 7 }),
    ]);
    expect(run.imported).toHaveLength(0);
  });

  test('a duplicate that is not included is skipped', () => {
    const run = planRun(statement(), selection([bankRow({ duplicateOf: 4 })]));

    expect(run.skipped).toEqual([
      expect.objectContaining({ integrationId: 'padaria-1', reason: 'duplicate' }),
    ]);
    expect(run.imported).toHaveLength(0);
  });

  test('a duplicate that is included is imported', () => {
    const run = planRun(statement(), selection([bankRow({ duplicateOf: 4 })], [], true));

    expect(run.imported).toEqual([
      expect.objectContaining({ integrationId: 'padaria-1', status: 'reconciled' }),
    ]);
    expect(run.skipped).toHaveLength(0);
  });

  test('a rejected row is only rejected', () => {
    const run = planRun(statement(), selection([], [bankRow()]));

    expect(run.rejected).toEqual([
      expect.objectContaining({ integrationId: 'padaria-1' }),
    ]);
    expect(run.imported).toHaveLength(0);
  });

  test('one bank transaction cannot be imported and rejected', () => {
    const row = bankRow();

    expect(() => planRun(statement(), selection([row], [row]))).toThrow('já está nesta importação');
  });
});
