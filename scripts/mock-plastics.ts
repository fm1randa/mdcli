// GET /v1/cadastros/plasticos: every plastic of every card, as a bare array.
// The web app loads it through cadastrosDatasource "plasticos" (mdb.js: the
// cache for "/cadastros/" + name with paginate=false, prefixed /api/v1 by the
// $http interceptor). update --account (#123) picks the new card's holder (tipo T).
const PLASTICS_PATH = '/api/v1/cadastros/plasticos';

// Cartão Ouro (1005) has a holder and an additional plastic; the other cards none.
const MOCK_PLASTICS = [
  { id: 7, conta: 1005, tipo: 'T', titular: true, nome: 'Titular', status: true },
  { id: 8, conta: 1005, tipo: 'A', titular: false, nome: 'Adicional', status: true },
];

export function plasticsRoute(method: string, pathname: string): Response | undefined {
  if (method !== 'GET' || pathname !== PLASTICS_PATH) return undefined;
  return Response.json(MOCK_PLASTICS);
}
