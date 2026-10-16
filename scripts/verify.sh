#!/usr/bin/env bash
# Verificação completa do mdcli: install, typecheck, lint, knip, testes e
# exercício real da CLI (sem tocar a API real nem a config do usuário).
# Uso: scripts/verify.sh   — sai com código != 0 em qualquer falha.
set -uo pipefail
cd "$(dirname "$0")/.."

FAILED=()
step() {
  local name="$1"; shift
  echo "::: $name"
  if "$@"; then echo "✓ $name"; else echo "✗ $name"; FAILED+=("$name"); fi
}

step "install"   bun install --frozen-lockfile
step "typecheck" bun run typecheck
step "lint"      bun run lint
step "knip"      bun run knip
step "test"      bun run test
# Audit: high/critical in runtime dependencies fails; in dev only warns.
# `bun audit --prod` (honored by bun 1.4.2 though absent from --help) audits
# only the "dependencies" graph.
audit_deps() {
  bun audit --prod --audit-level=high || return 1
  bun audit --audit-level=high >/dev/null 2>&1 \
    || echo "⚠ audit: vulnerabilidade high/critical em devDependencies (aviso, não reprova); rode \`bun audit\`"
  return 0
}
step "audit"     audit_deps

# --- E2E da CLI -------------------------------------------------------------
SANDBOX=$(mktemp -d)
export MDCLI_CONFIG_DIR="$SANDBOX"
MOCK_PID=""     # pid of the background job (may be a wrapper script around bun)
MOCK_SERVER_PID="" # pid reported by the mock server itself
# Only stop the processes this run started, so parallel verify runs (other
# clones or agents) on the same machine keep their own mock alive.
cleanup() {
  local pid
  for pid in "$MOCK_SERVER_PID" "$MOCK_PID"; do
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null
  done
  rm -rf "$SANDBOX"
}
trap cleanup EXIT
CLI=(bun bin/cli.ts)

expect_ok() {   # expect_ok <regex> <args...>
  local re="$1"; shift
  local out; out=$("${CLI[@]}" "$@" </dev/null 2>&1) || { echo "saída: $out"; return 1; }
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
}
expect_json() { # expect_json <js condition on d> <args...> — d = JSON parsed from stdout
  local cond="$1"; shift
  local out; out=$("${CLI[@]}" "$@" </dev/null) || { echo "saída: $out"; return 1; }
  OUT="$out" COND="$cond" bun -e 'const d = JSON.parse(process.env.OUT); if (!eval(process.env.COND)) process.exit(1);' \
    || { echo "esperava ($cond) em: $out"; return 1; }
}
expect_fail() { # expect_fail <regex> <args...>
  local re="$1"; shift
  local out
  if out=$("${CLI[@]}" "$@" </dev/null 2>&1); then echo "deveria falhar: $out"; return 1; fi
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
}

expect_json_error() { # expect_json_error <regex on .error> <args...> — fails, empty stdout, stderr = {"error": ...}
  local re="$1"; shift
  local out err
  if out=$("${CLI[@]}" "$@" 2>"$SANDBOX/stderr" </dev/null); then echo "deveria falhar: $out"; return 1; fi
  err=$(cat "$SANDBOX/stderr")
  [ -z "$out" ] || { echo "stdout deveria estar vazio: $out"; return 1; }
  ERR="$err" RE="$re" bun -e 'const d = JSON.parse(process.env.ERR); if (!new RegExp(process.env.RE).test(d.error)) process.exit(1);' \
    || { echo "esperava erro JSON /$re/ no stderr: $err"; return 1; }
}

# --version must match package.json exactly (single source of truth).
PKG_VERSION=$(bun -e 'console.log((await Bun.file("package.json").json()).version)')
step "cli --version"        expect_ok "^${PKG_VERSION//./\\.}\$" --version
step "cli --help"           expect_ok 'accounts' --help
for c in auth accounts categories tags entries cards; do
  step "cli $c --help"      expect_ok 'Usage' "$c" --help
done
step "cli comando inválido" expect_fail 'unknown command' nope
step "cli auth status"      expect_ok 'Authenticated: No' auth status
step "cli sem login"        expect_fail 'Not authenticated' accounts list

PORT_FILE="$SANDBOX/port"
bun scripts/mock-api.ts >"$PORT_FILE" 2>/dev/null </dev/null &
MOCK_PID=$!
for _ in $(seq 50); do [ "$(wc -l <"$PORT_FILE")" -ge 2 ] && break; sleep 0.1; done
MOCK_SERVER_PID=$(sed -n 2p "$PORT_FILE")
export MDCLI_API_URL="http://127.0.0.1:$(head -1 "$PORT_FILE")/api"
cat >"$SANDBOX/mdcli.config.json" <<JSON
{"auth":{"apiKey":"verify-key","uid":"verify-uid"},"authMethod":"manual"}
JSON
step "cli accounts list (mock)"        expect_ok 'Nubank' accounts list
step "cli accounts list --json (mock)" bash -c '"$@" accounts list --json </dev/null | bun -e "const d=JSON.parse(await Bun.stdin.text()); if(!JSON.stringify(d).includes(\"Nubank\")) process.exit(1)"' _ "${CLI[@]}"
# Writes (POST/PUT/DELETE) go through the same request() path as reads; the
# mock checks the JSON payload, echoes it back and answers DELETE with 204.
step "cli accounts create (mock)"        expect_ok 'Type: Poupança' accounts create --name Reserva --type Poupança --balance 100
step "cli accounts create --json (mock)" expect_json 'd.id === 2001 && d.nome === "Reserva" && d.tipoNovo === 122 && d.saldoInicial === 100' accounts create --name Reserva --type Poupança --balance 100 --json
step "cli accounts update (mock)"        expect_ok 'Account "Nubank PF" updated' accounts update 1001 --name "Nubank PF" --inactive
step "cli accounts update --json (mock)" expect_json 'd.id === 1001 && d.nome === "Nubank PF" && d.status === false' accounts update 1001 --name "Nubank PF" --inactive --json
step "cli accounts delete (mock)"        expect_ok 'Account 1001 deleted' accounts delete 1001 --dangerously-skip-confirmation
step "cli accounts delete --json (mock)" expect_json 'd.deleted === true && d.id === 1001' accounts delete 1001 --dangerously-skip-confirmation --json
step "cli accounts delete inexistente (mock)" expect_fail 'DELETE /v1/cadastros/contas/9999\): 404' accounts delete 9999 --dangerously-skip-confirmation

# Card / invoice / entries writes — regressions #12/#17 (card dates) and #10/#15
# (installment/transfer update). Mock only; never the real API.
step "cli cards list (mock)"                 expect_ok 'Cartão Azul' cards list
step "cli cards invoice (mock)"              expect_ok 'Mercado' cards invoice -a 1002 --month 2026-01
step "cli cards invoice --json (mock)"       expect_json 'Array.isArray(d) && d[0]?.description === "Mercado"' cards invoice -a 1002 --month 2026-01 --json
step "cli cards invoice primeiraFatura (mock)" expect_ok 'Mercado' cards invoice -a 1003
step "cli cards future (mock)"               expect_ok 'Notebook' cards future -a 1002
step "cli cards future --json (mock)"        expect_json 'Array.isArray(d) && d[0]?.installment === "3/6"' cards future -a 1002 --json
# Card create: dataCompetencia=purchase, dataPrevista=invoice due, not reconciled.
step "cli entries create cartão (mock)"      expect_ok 'Entry created' entries create -a 1002 -d Voo -v 10 -c 10 -D 2026-01-05
step "cli entries create cartão --json (mock)" expect_json 'd.id === 9001 && d.dataCompetencia === "2026-01-05" && d.dataPrevista === "2026-01-16" && d.conciliado === false && d.status === "confirmado"' entries create -a 1002 -d Voo -v 10 -c 10 -D 2026-01-05 --json
step "cli entries update parcela (mock)"     expect_ok 'Entry updated' entries update 60 -d "Notebook (2/6)"
step "cli entries update parcela --json (mock)" expect_json 'd.id === 60 && d.descricao === "Notebook (2/6)"' entries update 60 -d "Notebook (2/6)" --json
step "cli entries update transferência (mock)" expect_ok 'Entry updated' entries update 50 -d "Poupança mensal" -v 1200
step "cli entries update transferência --json (mock)" expect_json 'd.id === 50 && d.descricao === "Poupança mensal"' entries update 50 -d "Poupança mensal" -v 1200 --json
# Recurring series (#65): a scheduled occurrence stays scheduled, --scope maps
# to todos (the mock keeps it in the series only with todos: true) and editing
# without --scope warns on stderr.
step "cli entries update agendado mantém status (mock)" expect_json 'd.status === "agendado" && d.agendaId === null && d.dataEfetiva === null' entries update 80 -D 2027-01-25 --json
step "cli entries update agendado avisa no stderr (mock)" expect_ok 'only this occurrence will be changed' entries update 80 -D 2027-01-25
step "cli entries update --scope following (mock)" expect_json 'd.status === "agendado" && d.agendaId === 77 && d.parcela === "fixa"' entries update 80 -D 2027-01-25 --scope following --json
step "cli entries update --scope following texto (mock)" expect_ok 'Status: Scheduled' entries update 80 -D 2027-01-25 --scope following
step "cli entries update --pending confirma (mock)" expect_json 'd.status === "pendente"' entries update 80 --pending --scope this --json
step "cli entries update --scope fora de série (mock)" expect_fail 'not part of a recurring series' entries update 70 -d X --scope following
# entries list: the API refuses end dates past 2031-12-31 (#65), so the CLI
# checks first; under --json any error is {"error": ...} on stderr, exit 1.
step "cli entries list --json (mock)" expect_json 'Array.isArray(d) && d.some((e) => e.id === 70 && e.description === "Café")' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --json
step "cli entries list --no-invoices (mock)" expect_ok 'Entries' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --no-invoices
step "cli entries list total com sinal (mock)" expect_ok 'Total:' entries list -a 1001 -f 2026-01-01 -t 2026-01-31
step "cli entries list --to > 2031 (mock)" expect_fail 'is past 2031-12-31' entries list -a 1001 -f 2026-11-01 -t 2035-12-31
step "cli entries list --to > 2031 --json (mock)" expect_json_error 'is past 2031-12-31' entries list -a 1001 -f 2026-11-01 -t 2035-12-31 --json
step "cli erro da API em --json (mock)" expect_json_error 'GET /v1/lancamentos/9999\): 404' entries delete 9999 --dangerously-skip-confirmation --json
step "cli entries delete (mock)"             expect_ok 'Entry 70 deleted' entries delete 70 --dangerously-skip-confirmation
step "cli entries delete --json (mock)"      expect_json 'd.deleted === true && d.id === 70' entries delete 70 --dangerously-skip-confirmation --json
step "cli entries delete inexistente (mock)" expect_fail 'GET /v1/lancamentos/9999\): 404' entries delete 9999 --dangerously-skip-confirmation
# Delete with scope (#65): ?todos=true|false only for a series occurrence;
# the mock answers 400 to any other todos.
step "cli entries delete --scope following (mock)" expect_json 'd.deleted === true && d.id === 80 && d.scope === "following"' entries delete 80 --scope following --dangerously-skip-confirmation --json
step "cli entries delete série sem --scope avisa (mock)" expect_ok 'only this occurrence will be deleted' entries delete 80 --dangerously-skip-confirmation
step "cli entries delete --scope fora de série (mock)" expect_fail 'not part of a recurring series' entries delete 70 --scope following --dangerously-skip-confirmation

# Self-update of a global install, fully offline: a fake global layout like the
# one `bun install -g github:fm1randa/mdcli` creates, the mock answering the
# GitHub "latest release" endpoint (v2099.1.1) and a recorder in place of `bun`.
GLOBAL="$SANDBOX/bun/install/global"
GCLI="$GLOBAL/node_modules/mdcli/bin/cli.ts"
mkdir -p "$GLOBAL/node_modules/mdcli"
cp -r bin src package.json "$GLOBAL/node_modules/mdcli/"
ln -s "$PWD/node_modules" "$GLOBAL/node_modules/mdcli/node_modules"
echo '"mdcli": ["mdcli@github:fm1randa/mdcli#v2026.10.13", {}, "fm1randa-mdcli-abc1234", "sha512-x"],' >"$GLOBAL/bun.lock"
printf '#!/bin/sh\necho "$@" > "%s"\n' "$SANDBOX/update-args" >"$SANDBOX/fake-bun"; chmod +x "$SANDBOX/fake-bun"
RELEASE_URL() { echo "http://127.0.0.1:$(head -1 "$PORT_FILE")/github/repos/fm1randa/mdcli/releases/latest"; }
gcli() { env -u CI MDCLI_UPDATE_CHECK_URL="$(RELEASE_URL)" MDCLI_UPDATE_BUN="$SANDBOX/fake-bun" "$@"; }
set_global_version() { V="$1" F="$GLOBAL/node_modules/mdcli/package.json" bun -e 'const f=process.env.F; const p=await Bun.file(f).json(); p.version=process.env.V; await Bun.write(f, JSON.stringify(p))'; }
reset_update() { rm -f "$SANDBOX/update-check.json" "$SANDBOX/update-args"; set_global_version "$PKG_VERSION"; }
self_update() {
  reset_update
  local out
  out=$(gcli bun "$GCLI" accounts list --json 2>"$SANDBOX/update-err" </dev/null) || return 1
  OUT="$out" bun -e 'JSON.parse(process.env.OUT)' || { echo "stdout não é JSON: $out"; return 1; }
  [ ! -s "$SANDBOX/update-err" ] || { echo "stderr inesperado: $(cat "$SANDBOX/update-err")"; return 1; }
  for _ in $(seq 50); do [ -s "$SANDBOX/update-args" ] && break; sleep 0.1; done
  grep -qx 'install -g github:fm1randa/mdcli#v2099.1.1' "$SANDBOX/update-args" \
    || { echo "install: $(cat "$SANDBOX/update-args" 2>/dev/null)"; return 1; }
  # Within 24h of that check the next run must not check again.
  rm -f "$SANDBOX/update-args"
  gcli bun "$GCLI" --version >/dev/null 2>&1 </dev/null
  sleep 0.3; [ ! -e "$SANDBOX/update-args" ] || { echo "verificou de novo antes de 24h"; return 1; }
}
update_notice() {
  # The background install replaced the package: the next run says so once, on stderr.
  set_global_version 2099.1.1
  local out err
  out=$(gcli bun "$GCLI" --version 2>"$SANDBOX/update-err" </dev/null) || return 1
  [ "$out" = "2099.1.1" ] || { echo "stdout: $out"; return 1; }
  err=$(cat "$SANDBOX/update-err")
  [ "$err" = "mdcli atualizado de $PKG_VERSION para 2099.1.1" ] || { echo "stderr: $err"; return 1; }
  err=$(gcli bun "$GCLI" --version 2>&1 >/dev/null </dev/null)
  [ -z "$err" ] || { echo "aviso repetido: $err"; return 1; }
}
opt_out() { # opt_out env|config
  reset_update
  local err
  if [ "$1" = env ]; then
    err=$(MDCLI_NO_AUTO_UPDATE=1 gcli bun "$GCLI" --version 2>&1 >/dev/null </dev/null)
  else
    echo '{"autoUpdate": false}' >"$SANDBOX/mdcli.config.json"
    err=$(gcli bun "$GCLI" --version 2>&1 >/dev/null </dev/null)
    rm -f "$SANDBOX/mdcli.config.json"
  fi
  sleep 0.3; [ -z "$err" ] && [ ! -e "$SANDBOX/update-args" ] || { echo "opt-out ignorado: $err"; return 1; }
}
manual_update() {
  reset_update
  local out
  out=$(gcli bun "$GCLI" update 2>&1 </dev/null) || { echo "saída: $out"; return 1; }
  grep -q "mdcli atualizado de $PKG_VERSION para 2099.1.1" <<<"$out" || { echo "saída: $out"; return 1; }
  grep -qx 'install -g github:fm1randa/mdcli#v2099.1.1' "$SANDBOX/update-args" \
    || { echo "install: $(cat "$SANDBOX/update-args" 2>/dev/null)"; return 1; }
}
step "cli auto-update (instalação global, mock)" self_update
step "cli aviso de atualização no stderr" update_notice
step "cli auto-update desligado (MDCLI_NO_AUTO_UPDATE=1)" opt_out env
step "cli auto-update desligado (config autoUpdate=false)" opt_out config
step "cli update manual (mock)" manual_update
step "cli update fora de instalação global" expect_fail 'não está instalado globalmente' update

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "VERIFICAÇÃO FALHOU: ${FAILED[*]}"; exit 1
fi
echo "VERIFICAÇÃO OK"
