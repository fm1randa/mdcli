import { describe, expect, test } from 'bun:test';
import { resolveCategoryReference, type CategoryReference } from '../src/lib/category-resolution.js';
import type { Category } from '../src/types/index.js';

function category(id: number, nome: string, status: boolean): Category {
  return {
    id,
    nome,
    nomeRel: nome,
    tipo: 'd',
    status,
    permissoes: { visivel: true, acoes: { editar: true, excluir: true } },
    _ordenacao: nome.toUpperCase(),
    sistema: false,
  };
}

const activeMoradia = category(51, 'Moradia', true);
const inactiveMoradia = category(50, 'Moradia', false);
const secondActiveMoradia = category(52, 'Moradia', true);
const inactiveOnly = category(53, 'Aluguel antigo', false);

type Case = {
  name: string;
  input: string;
  id: number | null;
  catalog: Category[];
  expected: CategoryReference;
};

const cases: Case[] = [
  {
    name: 'a shared name uses the active category when the index points at the inactive one',
    input: 'moradia',
    id: 50,
    catalog: [activeMoradia, inactiveMoradia],
    expected: { kind: 'resolved', id: 51, category: activeMoradia },
  },
  {
    name: 'a shared name uses the active category regardless of case',
    input: 'MORADIA',
    id: 50,
    catalog: [activeMoradia, inactiveMoradia],
    expected: { kind: 'resolved', id: 51, category: activeMoradia },
  },
  {
    name: 'a name matching two active categories is ambiguous and lists both IDs',
    input: 'moradia',
    id: 50,
    catalog: [activeMoradia, inactiveMoradia, secondActiveMoradia],
    expected: { kind: 'ambiguous', ids: [51, 52] },
  },
  {
    name: 'an explicit inactive ID is refused instead of swapped for the active name',
    input: '50',
    id: 50,
    catalog: [activeMoradia, inactiveMoradia],
    expected: { kind: 'inactive', category: inactiveMoradia },
  },
  {
    name: 'an explicit active ID resolves',
    input: '51',
    id: 51,
    catalog: [activeMoradia, inactiveMoradia],
    expected: { kind: 'resolved', id: 51, category: activeMoradia },
  },
  {
    name: 'a name no category matches is unresolved',
    input: 'inexistente',
    id: null,
    catalog: [activeMoradia],
    expected: { kind: 'unresolved' },
  },
  {
    name: 'a name matching only an inactive category is refused',
    input: 'aluguel antigo',
    id: 53,
    catalog: [inactiveOnly],
    expected: { kind: 'inactive', category: inactiveOnly },
  },
  {
    name: 'an explicit ID the catalog does not list is left to the caller',
    input: '999',
    id: 999,
    catalog: [activeMoradia],
    expected: { kind: 'unlisted', id: 999 },
  },
];

describe('resolveCategoryReference', () => {
  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(resolveCategoryReference(testCase.input, testCase.id, testCase.catalog)).toEqual(testCase.expected);
    });
  }
});
