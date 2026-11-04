import { createHome, MANUAL_AUTH, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT } from './fixtures.js';

// Fictional ids. 201 and 202 are Conta Teste and Cartão Teste in the account fixture.
export const ONE_CONNECTION = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
      // In the registry this id does not exist; the last row has no Account at all.
      { id: 303, conta: 4242 },
      { id: 9004 },
    ],
  },
];

export const AFTER_SYNC = [
  {
    id: 501,
    status: 'UPDATING',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
      { id: 303, conta: 4242 },
      { id: 9004 },
    ],
  },
];

// 501 is listed twice: all must PUT that id once. 213 is an Account named "all".
export const MANY_CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
    ],
  },
  {
    id: 502,
    status: 'UPDATED',
    accounts: [{ id: 303, type: 'CONTA CORRENTE', conta: 213 }],
  },
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 301, type: 'CONTA CORRENTE', conta: 201 }],
  },
];

export const MANY_AFTER = [
  {
    id: 503,
    status: 'UPDATED',
    accounts: [{ id: 9005, type: 'CONTA CORRENTE', conta: 204 }],
  },
  {
    id: 501,
    status: 'UPDATING',
    accounts: [
      { id: 301, type: 'CONTA CORRENTE', conta: 201 },
      { id: 302, type: 'CARTAOCREDITO', conta: 202 },
    ],
  },
  {
    id: 502,
    status: 'UPDATING',
    accounts: [{ id: 303, type: 'CONTA CORRENTE', conta: 213 }],
  },
];

export const ACCOUNTS_WITH_ALL = {
  ...ACCOUNTS_RESPONSE,
  items: [...ACCOUNTS_RESPONSE.items, { ...CHECKING_ACCOUNT, id: 213, nome: 'all' }],
};

export interface SyncRun {
  api: MockApi;
  home: TestHome;
  /** First read, then the read that follows the PUT. Further reads keep the latter. */
  connections: (before: unknown, after: unknown) => void;
}

export function openSyncRun(): SyncRun {
  const api = startMockApi();
  const home = createHome(MANUAL_AUTH);
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('PUT /v1/integracao/connection/update/501', {});
  api.on('PUT /v1/integracao/connection/update/502', {});
  api.on('PUT /v1/integracao/connection/update/503', {});

  return {
    api,
    home,
    connections(before, after) {
      let reads = 0;
      api.on('GET /v1/integracao/connections', () => {
        reads += 1;
        return reads === 1 ? before : after;
      });
    },
  };
}
