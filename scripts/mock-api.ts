// Servidor HTTP local que imita a API do Meu Dinheiro para o scripts/verify.sh.
// Usa as mesmas fixtures dos testes; nunca toca a API real.
import { ACCOUNTS_RESPONSE } from '../test/fixtures.js';

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('Mdapikey') !== 'verify-key') {
      return new Response('{"message":"unauthorized"}', { status: 401 });
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/cadastros/contas') {
      return Response.json(ACCOUNTS_RESPONSE);
    }
    return new Response('{"message":"not found"}', { status: 404 });
  },
});

// Line 1: port. Line 2: our own pid, so verify.sh can stop exactly this process
// even when `bun` is a wrapper script that does not exec.
console.log(`${server.port}\n${process.pid}`);
