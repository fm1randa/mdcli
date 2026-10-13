// Servidor HTTP local que imita a API do Meu Dinheiro para o scripts/verify.sh.
// Usa as mesmas fixtures dos testes; nunca toca a API real.
import { ACCOUNTS_RESPONSE } from '../test/fixtures.js';

// GitHub "latest commit on main" endpoint used by the self-updater (no auth).
const MOCK_LATEST_SHA = '0123456789abcdef0123456789abcdef01234567';
const LATEST_COMMIT_PATH = '/github/repos/fm1randa/mdcli/commits/main';

const ACCOUNTS_PATH = '/api/v1/cadastros/contas';
const NEW_ACCOUNT_ID = 2001;

function notFound(): Response {
  return Response.json({ message: 'not found' }, { status: 404 });
}

function badRequest(message: string): Response {
  return Response.json({ message }, { status: 400 });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  // The real API expects JSON on writes; fail loudly if the CLI stops sending it.
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) {
    return Response.json({ message: 'expected a JSON body' }, { status: 415 });
  }
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest('invalid JSON body');
  }
}

function typeName(tipoNovo: unknown): string | undefined {
  return ACCOUNTS_RESPONSE.meta.tipos.find((t) => t.id === tipoNovo)?.nome;
}

// Stateless: writes echo the payload back like the real API, but the account
// list stays the fixture, so every verify run starts from the same data.
async function accountsRoute(req: Request, path: string): Promise<Response> {
  if (path === ACCOUNTS_PATH) {
    if (req.method === 'GET') return Response.json(ACCOUNTS_RESPONSE);
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body instanceof Response) return body;
      const tipo = typeName(body.tipoNovo);
      if (typeof body.nome !== 'string' || !body.nome) return badRequest('nome is required');
      if (!tipo) return badRequest(`unknown tipoNovo ${String(body.tipoNovo)}`);
      return Response.json({ ...body, id: NEW_ACCOUNT_ID, tipo, status: true, encerrada: false }, { status: 201 });
    }
    return notFound();
  }

  const match = path.match(/^\/api\/v1\/cadastros\/contas\/(\d+)$/);
  const existing = match && ACCOUNTS_RESPONSE.items.find((a) => a.id === Number(match[1]));
  if (!existing) return notFound();

  if (req.method === 'PUT') {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    // The CLI sends the bank as its id; the API answers with the bank object.
    const { banco: _banco, ...changes } = body;
    return Response.json({ ...existing, ...changes, id: existing.id, tipo: typeName(changes.tipoNovo) ?? existing.tipo });
  }
  if (req.method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  return notFound();
}

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === LATEST_COMMIT_PATH) return Response.json({ sha: MOCK_LATEST_SHA });
    if (req.headers.get('Mdapikey') !== 'verify-key') {
      return Response.json({ message: 'unauthorized' }, { status: 401 });
    }
    if (url.pathname === ACCOUNTS_PATH || url.pathname.startsWith(`${ACCOUNTS_PATH}/`)) {
      return accountsRoute(req, url.pathname);
    }
    return notFound();
  },
});

// Line 1: port. Line 2: our own pid, so verify.sh can stop exactly this process
// even when `bun` is a wrapper script that does not exec.
console.log(`${server.port}\n${process.pid}`);
