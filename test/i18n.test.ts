import { beforeEach, describe, expect, test, afterEach } from 'bun:test';
import { createHome, MANUAL_AUTH, runCli, startMockApi } from './helpers.js';

let api: ReturnType<typeof startMockApi>;
let home: ReturnType<typeof createHome>;

describe('i18n', () => {
  beforeEach(() => {
    api = startMockApi();
  });

  afterEach(() => {
    api.stop();
    home?.cleanup();
  });

  test('default pt-BR: help uses pt-BR headings', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--help'], { home, api, extraEnv: { MDCLI_LANG: undefined } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Uso:');
    expect(result.stdout).toContain('Opções:');
  });

  test('--lang en: help uses English headings', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--lang', 'en', '--help'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Options:');
  });

  test('MDCLI_LANG=en selects English', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--help'], { home, api, extraEnv: { MDCLI_LANG: 'en' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('--lang overrides MDCLI_LANG', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--lang', 'en', '--help'], { home, api, extraEnv: { MDCLI_LANG: 'pt-BR' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('unknown option error in pt-BR', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--bad-option'], { home, api, extraEnv: { MDCLI_LANG: undefined } });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("opção desconhecida");
  });

  test('unknown option error in en', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--bad-option', '--lang', 'en'], { home, api });
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('unknown option');
  });

  test('invalid --lang shows pt-BR error', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['--lang', 'de', 'accounts', 'list'], { home, api, extraEnv: { MDCLI_LANG: undefined } });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Valor de idioma inválido');
  });

  test('success/status message in pt-BR', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['auth', 'status'], { home, api, extraEnv: { MDCLI_LANG: undefined } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Autenticado:');
  });

  test('success/status message in en', async () => {
    home = createHome(MANUAL_AUTH);
    const result = await runCli(['auth', 'status', '--lang', 'en'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Authenticated:');
  });

  test('table header in pt-BR', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', { meta: { tipos: [{ id: 100, nome: 'Corrente' }] }, items: [] });
    const result = await runCli(['accounts', 'types'], { home, api, extraEnv: { MDCLI_LANG: undefined } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Tipos de Conta');
  });

  test('table header in en', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', { meta: { tipos: [{ id: 100, nome: 'Checking' }] }, items: [] });
    const result = await runCli(['accounts', 'types', '--lang', 'en'], { home, api });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Account Types');
  });

  test('table-driven commander errors: pt-BR uses `erro:` and no English fragments', async () => {
    home = createHome(MANUAL_AUTH);
    const table: Array<[string[], string, string[]]> = [
      [['--bad-opt'], 'erro:', ['for \'', 'argument', 'Expected']],
      [['accounts', 'list', 'extra'], 'erro:', ['for \'', 'argument', 'Expected']],
      [['nope'], 'erro:', ['for \'', 'argument', 'Expected']],
      [['sync', 'run'], 'erro:', ['for \'', 'argument', 'Expected']],
    ];
    for (const [args, mustContain, mustNotContain] of table) {
      const result = await runCli(args, { home, api, extraEnv: { MDCLI_LANG: undefined } });
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain(mustContain);
      for (const fragment of mustNotContain) {
        // Use word boundary for "argument" so "argumentos" (pt-BR) doesn't trigger.
        const pattern = fragment === 'argument' ? '\\bargument\\b' : fragment;
        expect(result.output).not.toMatch(new RegExp(pattern));
      }
    }
  });

  test('JSON output identical under both languages', async () => {
    home = createHome(MANUAL_AUTH);
    api.on('GET /v1/cadastros/contas', { items: [{ id: 1, nome: 'Nubank' }] });
    const pt = await runCli(['accounts', 'list', '--json'], { home, api });
    const en = await runCli(['accounts', 'list', '--json', '--lang', 'en'], { home, api });
    expect(pt.stdout).toBe(en.stdout);
  });
});
