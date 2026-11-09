import type { CardPlastic } from '../src/types/index.js';

// GET /v1/cadastros/plasticos: every plastic of every card, as a bare array.
// The web app loads it through cadastrosDatasource "plasticos" (mdb.js: the
// cache for "/cadastros/" + name with paginate=false, prefixed /api/v1 by the
// $http interceptor). update --account (#123) picks the new card's holder (tipo T).
const PLASTICS_PATH = '/api/v1/cadastros/plasticos';

// Cartão Teste Dois (205) has a holder and an additional plastic, plus an
// inactive holder that sorts first by name (the web skips it); the other
// cards none. The real list has no titular or permissoes (real use 2026-11-09).
const MOCK_PLASTICS: CardPlastic[] = [
  { id: 61, conta: 205, tipo: 'T', nome: 'Inativo', status: false },
  { id: 62, conta: 205, tipo: 'T', nome: 'Titular', status: true },
  { id: 63, conta: 205, tipo: 'A', nome: 'Adicional', status: true },
];

export function plasticsRoute(method: string, pathname: string): Response | undefined {
  if (method !== 'GET' || pathname !== PLASTICS_PATH) return undefined;
  return Response.json(MOCK_PLASTICS);
}
