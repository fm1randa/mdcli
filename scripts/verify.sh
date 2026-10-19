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
# Bill total (-87.50) must ignore the payment (+100) listed among the items.
step "cli cards invoice total (mock)"        expect_ok 'Total: -R\$.*87,50' cards invoice -a 1002 --month 2026-01
step "cli cards invoice --json (mock)"       expect_json 'Array.isArray(d) && d[0]?.description === "Mercado"' cards invoice -a 1002 --month 2026-01 --json
step "cli cards invoice primeiraFatura (mock)" expect_ok 'Mercado' cards invoice -a 1003
# Dogfood 2026-10-19: --month on a card with a date-only proximoVencimento
# (2026-11-16) asked for the 15th in UTC-3; months 00/13 reached the API.
in_sao_paulo() { TZ=America/Sao_Paulo "$@"; }
step "cli cards invoice --month vencimento local (mock)" in_sao_paulo expect_ok 'Cartão Ouro - 2026-11-16 \(1 entries\)' cards invoice -a 1005 --month 2026-11
step "cli cards invoice --month 2026-13 recusado (mock)" expect_fail 'Invalid invoice month "2026-13"' cards invoice -a 1005 --month 2026-13
step "cli cards invoice --month 2026-00 recusado (mock)" expect_fail 'Invalid invoice month "2026-00"' cards invoice -a 1005 --month 2026-00
step "cli entries create --invoice 2026-13 recusado (mock)" expect_fail 'Invalid invoice month "2026-13"' entries create -a 1005 -d X -v 1 -c 10 --invoice 2026-13
# Same item, same due date in both commands; date stays the purchase date.
step "cli cards invoice --json dueDate (mock)" in_sao_paulo expect_json 'd.length === 1 && d[0].id === 315471241 && d[0].date === "2025-11-19" && d[0].dueDate === "2026-11-16" && d[0].competenceDate === "2025-11-19"' cards invoice -a 1005 --month 2026-11 --json
step "cli entries list cartão mesma data do invoice (mock)" in_sao_paulo expect_json 'd.length === 1 && d[0].id === 315471241 && d[0].date === "2026-11-16" && d[0].competenceDate === "2025-11-19"' entries list -a 1005 -f 2026-11-01 -t 2026-11-30 --json
step "cli cards list --json campos do cartão (mock)" expect_json 'd.some((c) => c.id === 1005 && c.limit === 21804 && c.dueDay === 16 && c.nextDueDate === "2026-11-16" && c.nextClosingDate === "2026-11-05" && c.closingDaysBeforeDue === 11 && c.paymentAccountId === 1001 && typeof c.balance === "number")' cards list --json
step "cli cards future (mock)"               expect_ok 'Notebook' cards future -a 1002
# Bare-array API: remaining derived from "3/6" → 4 (old code always returned []).
step "cli cards future --json (mock)"        expect_json 'Array.isArray(d) && d.length === 1 && d[0]?.installment === "3/6" && d[0]?.remaining === 4' cards future -a 1002 --json
# Card create: dataCompetencia=purchase, dataPrevista=invoice due, not reconciled.
step "cli entries create cartão (mock)"      expect_ok 'ID: 91[0-9]{2}' entries create -a 1002 -d Voo -v 10 -c 10 -D 2026-01-05
step "cli entries create cartão --json (mock)" expect_json 'd.id === 9102 && d.occurrenceId === "46349170A2026-01-05" && d.dataCompetencia === "2026-01-05" && d.dataPrevista === "2026-01-16" && d.conciliado === false && d.status === "confirmado"' entries create -a 1002 -d Voo -v 10 -c 10 -D 2026-01-05 --json
# Finanças 2026-10-16: the POST answers an occurrence ID for card purchases
# (the CLI swaps in the entry ID from the invoice) and the statement list
# leaves card purchases out (the CLI reads them from the invoices).
# Seeded invoice has Mercado + Pagamento (tipo p); create adds two Voo purchases.
step "cli entries list cartão (mock)" expect_json 'd.length === 4 && d.every((e) => e.accountId === 1002 && e.date === "2026-01-16") && d.filter((e) => e.description === "Voo" && e.competenceDate === "2026-01-05").length === 2 && d.some((e) => e.description === "Pagamento cartão")' entries list -a 1002 -f 2026-01-01 -t 2026-01-31 --json
step "cli entries list cartão -k (mock)" expect_json 'd.length === 1 && d[0].id === 1' entries list -a 1002 -f 2026-01-01 -t 2026-01-31 -k merc --json
# Pagamento (tipo p, +100) must not become Income; bill purchases stay as expenses.
step "cli entries summary cartão sem pagamento (mock)" expect_json 'd.skippedPayments === 1 && d.total.income === 0 && d.total.expenses < 0' entries summary -a 1002 -f 2026-01-01 -t 2026-01-31 --json
step "cli entries update lançamento de cartão (mock)" expect_json 'd.id === 9102 && d.descricao === "Voo editado"' entries update 9102 -d "Voo editado" --json
step "cli entries update id de ocorrência (mock)" expect_fail 'series occurrence ID, not an entry ID' entries update 46349170A2026-01-05 -d X
# Create shapes deduced from the web bundle (dogfooding 2026-10-16): transfer
# naming contaOrigem/contaDestino, parcelada series with parcelas, scheduled.
step "cli entries create transferência --json (mock)" expect_json 'd.conta === 1001 && d.contaT === 1004 && d.valor === -500 && d.valorT === 500 && d.status === "conciliado"' entries create -a 1001 -T transfer --to-account 1004 -d Reserva -v 500 -D 2026-01-05 --json
step "cli entries create transferência sem destino (mock)" expect_fail 'needs a destination account' entries create -a 1001 -T transfer -d Reserva -v 500
step "cli entries create parcelada --json (mock)" expect_json 'd.parcela === "1/3" && d.valor === -33.34' entries create -a 1001 -d Geladeira -v 100 -c 10 -i 3 -D 2026-01-31 --json
step "cli entries create parcelada texto (mock)" expect_ok 'Installments: 1x .*33,34 \+ 2x .*33,33 \(monthly, every 1\)' entries create -a 1001 -d Geladeira -v 100 -c 10 -i 3 -D 2026-01-31
step "cli entries create fixa --frequency + --times (mock)" expect_ok 'Recurrence: monthly, every 2, 6 times' entries create -a 1001 -d Academia -v 90 -c 10 -r monthly --frequency 2 --times 6
step "cli entries create agendado --json (mock)" expect_json 'd.status === "agendado" && d.dataEfetiva === null && d.valorEfetivo === null' entries create -a 1001 -d IPVA -v 800 -c 10 -p -D 2031-11-05 --json
# Finanças 2026-10-19: -p is Confirmado off (no effective date or value); the
# API calls that pendente up to today and agendado after it (md.js). The old
# confirmed-not-reconciled state is --confirmed; --scheduled is an alias of -p.
step "cli entries create -p hoje = pendente (mock)" expect_json 'd.status === "pendente" && d.conciliado === false && d.dataEfetiva === null && d.valorEfetivo === null' entries create -a 1001 -d Farmácia -v 42.9 -c 10 -p --json
step "cli entries create -p hoje texto (mock)" expect_ok 'Status: Pending' entries create -a 1001 -d Farmácia -v 42.9 -c 10 -p
step "cli entries create --scheduled = -p (mock)" expect_json 'd.status === "pendente" && d.dataEfetiva === null' entries create -a 1001 -d Farmácia -v 42.9 -c 10 --scheduled --json
step "cli entries create --confirmed (mock)" expect_json 'd.status === "confirmado" && d.conciliado === false && d.dataEfetiva === "2026-01-05" && d.valorEfetivo === -30' entries create -a 1001 -d Feira -v 30 -c 10 --confirmed -D 2026-01-05 --json
step "cli entries create -p --confirmed recusado (mock)" expect_fail 'either --pending or --confirmed' entries create -a 1001 -d Feira -v 30 -c 10 -p --confirmed
step "cli entries create cartão -p não concilia (mock)" expect_json 'd.conciliado === false && d.status === "confirmado" && d.dataEfetiva === null && typeof d.occurrenceId === "string"' entries create -a 1002 -d Hotel -v 99 -c 10 -D 2026-01-06 -p --json
# Inactive categories (Finanças 2026-10-16): a shared name picks the active
# one; an explicit ID (or a name with no active match) is refused.
step "cli entries create categoria ativa por nome (mock)" expect_json 'd.categoria === 42' entries create -a 1001 -d Aluguel -v 10 -c moradia -D 2026-01-05 --json
step "cli entries create categoria inativa (mock)" expect_fail 'Category "Moradia" \(41\) is inactive' entries create -a 1001 -d Aluguel -v 10 -c 41 -D 2026-01-05
step "cli entries update categoria inativa (mock)" expect_fail 'is inactive' entries update 70 -c 41
step "cli entries update -p volta a pendente (mock)" expect_json 'd.status === "pendente" && d.conciliado === false && d.dataEfetiva === null' entries update 70 -p --json
step "cli entries update -p texto (mock)" expect_ok 'Status: Pending' entries update 70 -p
step "cli entries update parcela (mock)"     expect_ok 'Entry updated' entries update 60 -d "Notebook (2/6)"
step "cli entries update parcela --json (mock)" expect_json 'd.id === 60 && d.descricao === "Notebook (2/6)"' entries update 60 -d "Notebook (2/6)" --json
step "cli entries update transferência (mock)" expect_ok 'Entry updated' entries update 50 -d "Poupança mensal" -v 1200
step "cli entries update transferência --json (mock)" expect_json 'd.id === 50 && d.descricao === "Poupança mensal"' entries update 50 -d "Poupança mensal" -v 1200 --json
# Recurring series (#65): a scheduled occurrence stays scheduled, --scope maps
# to todos (the mock keeps it in the series only with todos: true) and editing
# without --scope warns on stderr.
step "cli entries update agendado mantém status (mock)" expect_json 'd.status === "agendado" && d.agendaId === null && d.dataEfetiva === null && d.scope === "this"' entries update 80 -D 2027-01-25 --json
step "cli entries update agendado avisa no stderr (mock)" expect_ok 'only this occurrence will be changed' entries update 80 -D 2027-01-25
step "cli entries update --scope following (mock)" expect_json 'd.status === "agendado" && d.agendaId === 77 && d.parcela === "fixa" && d.scope === "following"' entries update 80 -D 2027-01-25 --scope following --json
step "cli entries update --scope following texto (mock)" expect_ok 'Status: Scheduled' entries update 80 -D 2027-01-25 --scope following
step "cli entries update --confirmed confirma (mock)" expect_json 'd.status === "confirmado" && d.conciliado === false' entries update 80 --confirmed --scope this --json
step "cli entries update --scope fora de série (mock)" expect_fail 'not part of a recurring series' entries update 70 -d X --scope following
# entries list: the API refuses end dates past 2031-12-31 (#65), so the CLI
# checks first; under --json any error is {"error": ...} on stderr, exit 1.
step "cli entries list --json (mock)" expect_json 'Array.isArray(d) && d.some((e) => e.id === 70 && e.description === "Café")' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --json
step "cli entries list --no-invoices (mock)" expect_ok 'Entries' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --no-invoices
step "cli entries list total com sinal (mock)" expect_ok 'Total:' entries list -a 1001 -f 2026-01-01 -t 2026-01-31
# Dogfooding 2026-10-16: --repetition -> tipoRepeticao (1 single, 2 installment,
# 4 fixed), the extra list fields and entries show.
step "cli entries list --repetition (mock)" expect_json 'd.length === 1 && d[0].id === 60 && d[0].repetition === "installment" && d[0].tagIds[0] === 501 && d[0].documentNumber === "NF-1"' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --repetition installment --json
step "cli entries list --csv campos extras (mock)" expect_ok 'transfer_account,tags,notes,document_number' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --csv
step "cli entries list --csv nomes de tag (mock)" expect_ok ',Trabalho,parcelado,NF-1' entries list -a 1001 -f 2026-01-01 -t 2026-01-31 --csv
step "cli entries summary --repetition (mock)" expect_json 'd.total.count === 1 && d.skippedTransfers === 1' entries summary -a 1001 -f 2026-01-01 -t 2026-01-31 -R single --json
step "cli entries show (mock)" expect_ok 'Repetition: Installment \(2/6\)' entries show 60
step "cli entries show --json (mock)" expect_json 'd.id === 60 && d.notes === "parcelado" && d.seriesId === 99 && d.competenceDate === "2026-01-10"' entries show 60 --json
step "cli entries show --raw (mock)" expect_json 'd.agendaId === 77 && d.parcela === "fixa"' entries show 80 --raw
step "cli entries show inexistente (mock)" expect_fail 'GET /v1/lancamentos/9999\): 404' entries show 9999
step "cli entries list --to > 2031 (mock)" expect_fail 'is past 2031-12-31' entries list -a 1001 -f 2026-11-01 -t 2035-12-31
step "cli entries list --to > 2031 --json (mock)" expect_json_error 'is past 2031-12-31' entries list -a 1001 -f 2026-11-01 -t 2035-12-31 --json
step "cli erro da API em --json (mock)" expect_json_error 'GET /v1/lancamentos/9999\): 404' entries delete 9999 --dangerously-skip-confirmation --json
# Jardinagem 2026-10-19: Number("") is 0, so -v "" created an R$ 0 entry and
# delete "" reached the API with id 0. Strict parsing refuses both.
step "cli entries create -v vazio recusado (mock)" expect_fail 'Invalid value ""' entries create -a 1001 -d X -v "" -c 10
step "cli entries create -v 1e3 recusado (mock)" expect_fail 'Invalid value "1e3"' entries create -a 1001 -d X -v 1e3 -c 10
step "cli entries create -v 1,50 (mock)" expect_json 'd.valor === -1.5' entries create -a 1001 -d Pão -v 1,50 -c 10 -D 2026-01-05 --json
step "cli entries delete id vazio recusado (mock)" expect_fail 'Invalid entry ID' entries delete "" --dangerously-skip-confirmation
step "cli accounts delete 0x10 recusado (mock)" expect_fail 'Invalid account ID' accounts delete 0x10 --dangerously-skip-confirmation
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
