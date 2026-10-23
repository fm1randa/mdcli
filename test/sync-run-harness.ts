import { createHome, MANUAL_AUTH, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CHECKING_ACCOUNT } from './fixtures.js';

// Fictional ids. 1001 and 1002 are Nubank and Cartão Azul in the account fixture.
export const ONE_CONNECTION = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
      // In the registry this id does not exist; the last row has no Account at all.
      { id: 9003, conta: 4242 },
      { id: 9004 },
    ],
  },
];

export const AFTER_SYNC = [
  {
    id: 501,
    status: 'UPDATING',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
      { id: 9003, conta: 4242 },
      { id: 9004 },
    ],
  },
];

// 501 is listed twice: all must PUT that id once. 1009 is an Account named "all".
export const MANY_CONNECTIONS = [
  {
    id: 501,
    status: 'UPDATED',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
    ],
  },
  {
    id: 502,
    status: 'UPDATED',
    accounts: [{ id: 9003, type: 'CONTA CORRENTE', conta: 1009 }],
  },
  {
    id: 501,
    status: 'UPDATED',
    accounts: [{ id: 9001, type: 'CONTA CORRENTE', conta: 1001 }],
  },
];

export const MANY_AFTER = [
  {
    id: 503,
    status: 'UPDATED',
    accounts: [{ id: 9005, type: 'CONTA CORRENTE', conta: 1004 }],
  },
  {
    id: 501,
    status: 'UPDATING',
    accounts: [
      { id: 9001, type: 'CONTA CORRENTE', conta: 1001 },
      { id: 9002, type: 'CARTAOCREDITO', conta: 1002 },
    ],
  },
  {
    id: 502,
    status: 'UPDATING',
    accounts: [{ id: 9003, type: 'CONTA CORRENTE', conta: 1009 }],
  },
];

export const ACCOUNTS_WITH_ALL = {
  ...ACCOUNTS_RESPONSE,
  items: [...ACCOUNTS_RESPONSE.items, { ...CHECKING_ACCOUNT, id: 1009, nome: 'all' }],
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
