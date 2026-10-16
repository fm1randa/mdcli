import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHome, MANUAL_AUTH, mutations, runCli, type MockApi, startMockApi, type TestHome } from './helpers.js';

let api: MockApi;
let home: TestHome;

// A future occurrence of a fixed monthly series, as GET /v1/lancamentos/:id
// returns it: scheduled, so no effective date or value yet.
const SCHEDULED_OCCURRENCE = {
  id: 80,
  descricao: 'NuCel',
  tipo: 'd',
  valor: -45,
  valorPrevisto: -45,
  data: '2027-01-10',
  dataPrevista: '2027-01-10',
  status: 'agendado',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  parcela: 'fixa',
  agendaId: 77,
  agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
  tags: [],
};

const PENDING_ENTRY = {
  id: 70,
  descricao: 'Café',
  tipo: 'd',
  valor: -12.5,
  data: '2026-01-12',
  dataPrevista: '2026-01-12',
  dataEfetiva: '2026-01-12',
  status: 'pendente',
  conciliado: false,
  conta: 1001,
  categoria: 10,
  tags: [],
};

beforeEach(() => {
  api = startMockApi();
  api.on('GET /v1/lancamentos/80', SCHEDULED_OCCURRENCE);
  api.on('GET /v1/lancamentos/70', PENDING_ENTRY);
  home = createHome(MANUAL_AUTH);
});

afterEach(() => {
  api.stop();
  home.cleanup();
});

function putBody(): Record<string, unknown> {
  const put = mutations(api).find((r) => r.method === 'PUT');
  if (!put) throw new Error('no PUT was sent');
  return put.body as Record<string, unknown>;
}

describe('entries update on a recurring series', () => {
  test('keeps a scheduled occurrence scheduled and warns that only it changes', async () => {
    api.on('PUT /v1/lancamentos/80', { id: 80, descricao: 'NuCel', valor: -45, data: '2027-01-25', status: 'agendado' });

    const result = await runCli(['entries', 'update', '80', '-D', '2027-01-25', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = putBody();
    expect(body.status).toEqual({ confirmado: false, conciliado: false });
    expect(body).not.toHaveProperty('dataEfetiva');
    expect(body).not.toHaveProperty('valorEfetivo');
    expect(body).toMatchObject({
      dataPrevista: '2027-01-25',
      agendaId: 77,
      parcela: 'fixa',
      todos: false,
      agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2027-01-25' },
    });
    expect(result.stderr).toContain('only this occurrence will be changed, and it will leave the series');
    const json = JSON.parse(result.stdout);
    expect(json.status).toBe('agendado');
    expect(json.scope).toBe('this');
  });

  test('--scope following sends todos: true and prints the status the API answered', async () => {
    api.on('PUT /v1/lancamentos/80', { id: 80, descricao: 'NuCel', valor: -45, data: '2027-01-25', status: 'agendado' });

    const result = await runCli(['entries', 'update', '80', '-D', '2027-01-25', '--scope', 'following'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody().todos).toBe(true);
    expect(putBody().status).toEqual({ confirmado: false, conciliado: false });
    expect(result.stderr).not.toContain('only this occurrence');
    expect(result.stdout).toContain('Status: Scheduled');
    expect(result.stdout).toContain('Scope: this and the following occurrences');
  });

  test('--scope following --json includes scope alongside the API response', async () => {
    api.on('PUT /v1/lancamentos/80', { id: 80, descricao: 'NuCel', valor: -45, data: '2027-01-25', status: 'agendado' });

    const result = await runCli(
      ['entries', 'update', '80', '-D', '2027-01-25', '--scope', 'following', '--json'],
      { home, api }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 80, status: 'agendado', scope: 'following' });
  });

  test('an entry outside a series --json has no scope field', async () => {
    api.on('PUT /v1/lancamentos/70', { ...PENDING_ENTRY, descricao: 'Café X' });

    const result = await runCli(['entries', 'update', '70', '-d', 'Café X', '--json'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).not.toHaveProperty('scope');
  });

  test('--scope this is explicit, so no warning', async () => {
    api.on('PUT /v1/lancamentos/80', { id: 80, descricao: 'NuCel', valor: -45, data: '2027-01-10', status: 'agendado' });

    const result = await runCli(['entries', 'update', '80', '--value=-50', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({ todos: false, valor: -50, valorPrevisto: -50 });
    expect(putBody()).not.toHaveProperty('valorEfetivo');
    expect(result.stderr).toBe('');
  });

  test('--pending confirms a scheduled occurrence with its effective date and value', async () => {
    api.on('PUT /v1/lancamentos/80', {
      id: 80,
      descricao: 'NuCel',
      valor: -45,
      data: '2027-01-10',
      status: { confirmado: true, conciliado: false },
    });

    const result = await runCli(['entries', 'update', '80', '--pending', '--scope', 'this'], { home, api });

    expect(result.exitCode).toBe(0);
    expect(putBody()).toMatchObject({
      status: { confirmado: true, conciliado: false },
      dataEfetiva: '2027-01-10',
      valorEfetivo: -45,
    });
    expect(result.stdout).toContain('Status: Pending');
    expect(result.stdout).not.toContain('Scheduled');
  });

  test('a scheduled transfer stays scheduled too', async () => {
    api.on('GET /v1/lancamentos/81', {
      id: 81,
      descricao: 'Reserva',
      tipo: 't',
      valor: -300,
      valorT: 300,
      data: '2027-02-05',
      dataPrevista: '2027-02-05',
      status: 'agendado',
      conciliado: false,
      conta: 1001,
      contaT: 1003,
      categoria: 30,
      parcela: 'fixa',
      agendaId: 78,
      tags: [],
    });
    api.on('PUT /v1/lancamentos/81', { id: 81, descricao: 'Reserva', valor: -350, data: '2027-02-05', status: 'agendado' });

    const result = await runCli(['entries', 'update', '81', '-v', '350', '--scope', 'following'], { home, api });

    expect(result.exitCode).toBe(0);
    const body = putBody();
    expect(body).toMatchObject({
      transferencia: true,
      status: { confirmado: false, conciliado: false },
      confirmado: false,
      valor: -350,
      valorT: 350,
      todos: true,
    });
    expect(body).not.toHaveProperty('dataEfetiva');
    expect(body).not.toHaveProperty('valorEfetivo');
    expect(body).not.toHaveProperty('valorEfetivoT');
  });

  test('an entry outside a series gets no todos flag and refuses --scope following', async () => {
    api.on('PUT /v1/lancamentos/70', { ...PENDING_ENTRY, descricao: 'Café da tarde' });

    const plain = await runCli(['entries', 'update', '70', '-d', 'Café da tarde'], { home, api });
    expect(plain.exitCode).toBe(0);
    expect(putBody()).not.toHaveProperty('todos');
    expect(putBody().status).toEqual({ confirmado: true, conciliado: false });
    expect(plain.stderr).toBe('');

    const following = await runCli(['entries', 'update', '70', '-d', 'X', '--scope', 'following'], { home, api });
    expect(following.exitCode).toBe(1);
    expect(following.stderr).toContain('Entry 70 is not part of a recurring series, so --scope following does not apply.');
    expect(mutations(api)).toHaveLength(1);
  });

  test('rejects an unknown --scope before touching the API', async () => {
    const result = await runCli(['entries', 'update', '80', '-d', 'X', '--scope', 'all'], { home, api });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("argument 'all' is invalid");
    expect(api.requests).toHaveLength(0);
  });
});
