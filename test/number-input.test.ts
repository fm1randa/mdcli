import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, startMockApi, type MockApi, type TestHome } from './helpers.js';
import { ACCOUNTS_RESPONSE, CATEGORIES_RESPONSE } from './fixtures.js';

// Jardinagem 2026-10-19: `entries create -v ""` created an R$ 0 entry and
// `entries delete ""` reached the API with id 0, because Number('') is 0.
let api: MockApi;
let home: TestHome;

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/cadastros/contas', ACCOUNTS_RESPONSE);
  api.on('GET /v1/cadastros/categorias', CATEGORIES_RESPONSE);
  api.on('POST /v1/lancamentos', (req) => ({ id: 9, ...(req.body as object) }));
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

describe('entries create -v', () => {
  for (const value of ['', ' ', '1e3', '0x10', 'Infinity']) {
    test(`refuses ${JSON.stringify(value)} without calling the API`, async () => {
      const result = await runCli(['entries', 'create', '-a', '1001', '-d', 'X', '-c', '10', '-v', value], { home, api });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`Invalid value "${value}". Use a number like 10, 10.50 or 10,50.`);
      expect(api.requests).toHaveLength(0);
    });
  }

  test('reads a decimal comma', async () => {
    const result = await runCli(
      ['entries', 'create', '-a', '1001', '-d', 'Pão', '-c', '10', '-v', '1,50', '-D', '2026-01-05', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(mutations(api)).toHaveLength(1);
    expect(mutations(api)[0].body).toMatchObject({ valor: -1.5 });
  });
});

describe('ID arguments', () => {
  const commands: string[][] = [
    ['entries', 'delete'],
    ['entries', 'show'],
    ['entries', 'update'],
    ['accounts', 'delete'],
    ['categories', 'delete'],
    ['tags', 'delete'],
  ];
  for (const command of commands) {
    for (const id of ['', '0', '1e3', '0x10']) {
      test(`${command.join(' ')} ${JSON.stringify(id)} is refused without calling the API`, async () => {
        const extra =
          command[1] === 'update' ? ['-d', 'X']
          : command[0] === 'categories' ? ['--move-to', '10', '--dangerously-skip-confirmation']
          : command[1] === 'delete' ? ['--dangerously-skip-confirmation']
          : [];
        const result = await runCli([...command, id, ...extra], { home, api });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/Invalid (entry|account|category|tag) ID/);
        expect(api.requests).toHaveLength(0);
      });
    }
  }

  test('an empty --account is not account 0', async () => {
    const result = await runCli(['entries', 'create', '-a', '', '-d', 'X', '-c', '10', '-v', '5'], { home, api });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown account: ');
    expect(mutations(api)).toHaveLength(0);
  });
});
