#!/usr/bin/env bash
# Verificação completa do mdcli: install, typecheck, lint, knip, testes e
# exercício real da CLI (sem tocar a API real nem a config do usuário).
# Uso: scripts/verify.sh   — sai com código != 0 em qualquer falha.
set -uo pipefail
cd "$(dirname "$0")/.."

# Same result on any terminal: the caller's environment must not change what
# the CLI prints. In GitHub CI TERM is unset; claude.ai containers set
# TERM=linux (which makes @inquirer/prompts draw ">" instead of "❯") and may
# force color, which puts ANSI codes in the output the checks below grep.
# Same list as TERMINAL_VARS in test/helpers.ts. TERM=dumb is what turns
# chalk's colors off; NO_COLOR (which chalk ignores) is for other tools.
unset TERM COLORTERM FORCE_COLOR CLICOLOR CLICOLOR_FORCE NO_COLOR TERM_PROGRAM
export NO_COLOR=1 TERM=dumb

FAILED=()
step() {
  local name="$1"; shift
  echo "::: $name"
  if "$@"; then echo "✓ $name"; else echo "✗ $name"; FAILED+=("$name"); fi
}

step "install"   bun install --frozen-lockfile
# README.en.md translates README.md: its top comment records the git blob hash
# of the README.md it matches (readme-blob). Computed in Bun, like
# `git hash-object README.md`, since CI checks out without history.
readme_sync() {
  bun -e '
    const readme = new Uint8Array(await Bun.file("README.md").arrayBuffer());
    const hasher = new Bun.CryptoHasher("sha1");
    hasher.update(`blob ${readme.length}\0`);
    hasher.update(readme);
    const actual = hasher.digest("hex");
    const head = (await Bun.file("README.en.md").text()).split("\n", 1)[0];
    const recorded = head.match(/readme-blob: ([0-9a-f]{40})/)?.[1];
    if (recorded === actual) process.exit(0);
    console.log(recorded
      ? `README.md mudou (blob ${actual}) e o README.en.md ainda traduz o blob ${recorded}.`
      : "README.en.md: falta \"readme-blob: <hash>\" no comentário da linha 1.");
    console.log("Sincronize o README.en.md com o README.md e atualize no comentário da linha 1 o SHA base e o readme-blob (git hash-object README.md).");
    process.exit(1);
  '
}
step "readme sync" readme_sync
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
CLI=(bun bin/cli.ts --lang en)

expect_ok() {   # expect_ok <regex> <args...>
  local re="$1"; shift
  local out; out=$("${CLI[@]}" "$@" </dev/null 2>&1) || { echo "saída: $out"; return 1; }
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
}
expect_ok_without() { # expect_ok_without <regex> <absent regex> <args...>
  local re="$1" absent="$2"; shift 2
  local out; out=$("${CLI[@]}" "$@" </dev/null 2>&1) || { echo "saída: $out"; return 1; }
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
  if grep -Eq "$absent" <<<"$out"; then echo "não esperava /$absent/ em: $out"; return 1; fi
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
for c in auth accounts categories tags entries cards sync; do
  step "cli $c --help"      expect_ok 'Usage' "$c" --help
done
step "cli sync list --help" expect_ok 'Usage' sync list --help
step "cli sync run --help"  expect_ok 'Usage' sync run --help
step "cli entries import --help" expect_ok 'Usage' entries import --help
step "cli entries import list --help" expect_ok 'Usage' entries import list --help
step "cli entries import run --help" expect_ok 'Usage' entries import run --help
step "cli comando inválido" expect_fail 'unknown command' nope
step "cli auth status"      expect_ok 'Authenticated: No' auth status
step "cli sem login"        expect_fail 'Not authenticated' accounts list

# One JSON line per request, so the sync list step can see the method.
# Unset, the mock does not write this file. Older steps do not read it.
export MDCLI_MOCK_LOG="$SANDBOX/mock-requests.log"
: >"$MDCLI_MOCK_LOG"
PORT_FILE="$SANDBOX/port"
bun scripts/mock-api.ts >"$PORT_FILE" 2>/dev/null </dev/null &
MOCK_PID=$!
for _ in $(seq 50); do [ "$(wc -l <"$PORT_FILE")" -ge 2 ] && break; sleep 0.1; done
MOCK_SERVER_PID=$(sed -n 2p "$PORT_FILE")
export MDCLI_API_URL="http://127.0.0.1:$(head -1 "$PORT_FILE")/api"
cat >"$SANDBOX/mdcli.config.json" <<JSON
{"auth":{"apiKey":"verify-key","uid":"verify-uid"},"authMethod":"manual"}
JSON
# Reads connections and the account registry. No --yes. A PUT or POST fails the step.
sync_list() {
  local log="$MDCLI_MOCK_LOG"
  local before=0
  [ -f "$log" ] && before=$(wc -l <"$log")
  local out
  out=$("${CLI[@]}" sync list </dev/null 2>&1) || { echo "output: $out"; return 1; }
  grep -Eq 'Nubank' <<<"$out" || { echo "expected Nubank in: $out"; return 1; }
  grep -Eq 'No account' <<<"$out" || { echo "expected an unlinked account in: $out"; return 1; }
  local fresh
  fresh=$(tail -n +"$((before + 1))" "$log")
  [ -n "$fresh" ] || { echo "the mock did not log sync list"; return 1; }
  if grep -Ev '"method":"GET"' <<<"$fresh" | grep -q .; then
    echo "sync list must not write: $fresh"
    return 1
  fi
  grep -Eq '/api/v1/integracao/connections' <<<"$fresh" \
    || { echo "missing GET of connections: $fresh"; return 1; }
}
step "cli accounts list (mock)"        expect_ok 'Nubank' accounts list
step "cli sync list (mock)"            sync_list
# The import steps only read. The one POST allowed is the AI category
# suggestion (smartmatch/ai); a commit POST, a Sync PUT, or any other write
# fails the step. The commit bodies are asserted by the test suite.
reads_and_ai_only() {
  local writes
  writes=$(grep -Ev '"method":"GET"' <<<"$1" | grep -Fxv '{"method":"POST","path":"/api/v1/smartmatch/ai"}')
  if [ -n "$writes" ]; then
    echo "$2 must not write: $writes"
    return 1
  fi
}
# A --since inside the 90-day window whatever day verify runs on.
IMPORT_SINCE=$(bun -e 'import { localDay } from "./test/helpers.ts"; console.log(localDay(-30))')
# Without --since and without a connection summary (the mock has none, like a real GET): the statement
# since the account's last statement date (the mock sets it 3 days ago), and the AI for the category. No --yes.
LAST_STATEMENT=$(bun -e 'import { localDay } from "./test/helpers.ts"; console.log(localDay(-3))')
import_list() {
  local log="$MDCLI_MOCK_LOG"
  local before=0
  [ -f "$log" ] && before=$(wc -l <"$log")
  local out
  out=$("${CLI[@]}" entries import list -a 1001 </dev/null 2>&1) || { echo "output: $out"; return 1; }
  grep -Eq 'Padaria Ficticia' <<<"$out" || { echo "expected the statement in: $out"; return 1; }
  grep -Eq 'aaaaaaaa' <<<"$out" || { echo "expected the prefix in: $out"; return 1; }
  grep -Eq 'Alimentação \(AI\)' <<<"$out" || { echo "expected the AI category in: $out"; return 1; }
  local fresh
  fresh=$(tail -n +"$((before + 1))" "$log")
  [ -n "$fresh" ] || { echo "the mock did not log import list"; return 1; }
  grep -Fq "\"path\":\"/api/v1/integracao/account/9001/transactions\",\"query\":\"start=$LAST_STATEMENT\"" <<<"$fresh" \
    || { echo "without --since, import list must load the statement since $LAST_STATEMENT: $fresh"; return 1; }
  grep -Eq '/v2/lancamentos' <<<"$fresh" \
    || { echo "missing GET of candidates: $fresh"; return 1; }
  grep -Eq '/api/v1/smartmatch/ai' <<<"$fresh" \
    || { echo "missing the AI POST: $fresh"; return 1; }
  reads_and_ai_only "$fresh" "entries import list"
}
step "cli entries import list (mock)"  import_list
step "cli entries import list --search-* (mock)" expect_ok 'Candidates' entries import list -a 1001 --search-from 2026-01-01 --search-to 2026-12-31
# Rehearses an Import with --ids over the full statement (--since). No --yes.
import_run_dry() {
  local log="$MDCLI_MOCK_LOG"
  local before=0
  [ -f "$log" ] && before=$(wc -l <"$log")
  local out
  out=$("${CLI[@]}" entries import run -a 1001 --since "$IMPORT_SINCE" --ids aaaaaaaa -c 10 --dry-run </dev/null 2>&1) \
    || { echo "output: $out"; return 1; }
  grep -Eq 'aaaaaaaa' <<<"$out" || { echo "expected the prefix in: $out"; return 1; }
  grep -Eq 'Dry run' <<<"$out" || { echo "expected the dry-run notice in: $out"; return 1; }
  local fresh
  fresh=$(tail -n +"$((before + 1))" "$log")
  grep -Eq '/api/v1/integracao/account/9001/transactions' <<<"$fresh" \
    || { echo "missing GET of transactions: $fresh"; return 1; }
  # One read of the session state, with the uid like the web, for every preference the run needs.
  [ "$(grep -Fc '"path":"/api/v1/frontend/sessao","query":"uid=verify-uid"' <<<"$fresh")" = 1 ] \
    && [ "$(grep -Fc '/api/v1/frontend/sessao' <<<"$fresh")" = 1 ] \
    || { echo "expected one GET of the session state with uid=verify-uid: $fresh"; return 1; }
  reads_and_ai_only "$fresh" "entries import run --dry-run"
}
step "cli entries import run --dry-run (mock)" import_run_dry
# Rehearses an Import from a --plan file over the statement since the last statement date (no --since). No --yes.
import_run_plan_dry() {
  local log="$MDCLI_MOCK_LOG"
  local before=0
  [ -f "$log" ] && before=$(wc -l <"$log")
  local plan="$SANDBOX/import-plan.json"
  cat >"$plan" <<'JSON'
{"transactions":[{"id":"aaaaaaaa","action":"import","category":10,"description":"Plano ensaiado"}]}
JSON
  local out
  out=$("${CLI[@]}" entries import run -a 1001 --plan "$plan" --dry-run </dev/null 2>&1) \
    || { echo "output: $out"; return 1; }
  grep -Eq 'Plano ensaiado' <<<"$out" || { echo "expected the plan description in: $out"; return 1; }
  grep -Eq 'Dry run' <<<"$out" || { echo "expected the dry-run notice in: $out"; return 1; }
  local fresh
  fresh=$(tail -n +"$((before + 1))" "$log")
  reads_and_ai_only "$fresh" "entries import run --plan --dry-run"
}
step "cli entries import run --plan --dry-run (mock)" import_run_plan_dry
# Rehearses an Import chosen in $EDITOR. A fake editor checks the line the file
# opened with (the AI category included) and rewrites the description. The
# temporary file must be gone afterwards.
import_run_edit_dry() {
  local log="$MDCLI_MOCK_LOG"
  local before=0
  [ -f "$log" ] && before=$(wc -l <"$log")
  local editor="$SANDBOX/fake-editor.sh"
  cat >"$editor" <<SH
#!/bin/sh
echo "\$1" > "$SANDBOX/edit-path"
grep -qx 'import aaaaaaaa 2026-10-07 -12.34 Alimentação | Padaria Ficticia' "\$1" || exit 9
echo 'import aaaaaaaa 2026-10-07 -12,34 10 | Padaria editada' > "\$1"
SH
  local out
  out=$(EDITOR="sh $editor" "${CLI[@]}" entries import run -a 1001 --edit --dry-run --json </dev/null 2>&1) \
    || { echo "output: $out"; return 1; }
  bun -e 'const d = JSON.parse(process.argv[1]); const i = d.imported[0]; if (d.dryRun !== true || d.imported.length !== 1 || i.description !== "Padaria editada" || i.categoryId !== 10) process.exit(1)' "$out" \
    || { echo "expected the edited dry run in: $out"; return 1; }
  local path
  path=$(cat "$SANDBOX/edit-path")
  [ ! -e "$path" ] || { echo "the --edit file was left on disk: $path"; return 1; }
  local fresh
  fresh=$(tail -n +"$((before + 1))" "$log")
  reads_and_ai_only "$fresh" "entries import run --edit --dry-run"
}
step "cli entries import run --edit --dry-run (mock)" import_run_edit_dry
# The web's balances (#67): the mock sums Nubank's seeded entries up to --at
# (the -45 scheduled for 2027-01-10 only in the projected one); the stale
# bank statement (250.50) is only bankBalance.
step "cli accounts list --at balances (mock)" expect_json 'd.find((a) => a.id === 1001).balance === -1562.5 && d.find((a) => a.id === 1001).projectedBalance === -1607.5 && d.find((a) => a.id === 1001).bankBalance === 250.5 && d.find((a) => a.id === 1002).balance === null' accounts list --json --at 2027-01-31
step "cli accounts list --json (mock)" bash -c '"$@" accounts list --json </dev/null | bun -e "const d=JSON.parse(await Bun.stdin.text()); if(!JSON.stringify(d).includes(\"Nubank\")) process.exit(1)"' _ "${CLI[@]}"
# Writes (POST/PUT/DELETE) go through the same request() path as reads; the
# mock checks the JSON payload, echoes it back and answers DELETE with 204.
step "cli accounts create (mock)"        expect_ok 'Type: Poupança' accounts create --name Reserva --type Poupança --balance 100
step "cli accounts create --json (mock)" expect_json 'd.id === 2001 && d.nome === "Reserva" && d.tipoNovo === 122 && d.saldoInicial === 100' accounts create --name Reserva --type Poupança --balance 100 --json
step "cli accounts create form (mock)"   expect_json 'd.dataSaldoInicial === "2026-01-31" && d.saldoInicial === -100 && d.liquidez === 0' accounts create --name Reserva --type Poupança --balance 100 --debtor --balance-date 2026-01-31 --liquidity fixed --json
step "cli accounts update --close (mock)" expect_json 'd.status === false && d.encerrada === true && d.exibirBP === false' accounts update 1001 --inactive --close --hide-net-worth --json
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
# Jardinagem 2026-10-21: --month on a card without proximoVencimento assumed
# day 10; it now takes primeiraFatura's day (16 in the mock).
step "cli cards invoice --month sem vencimento (mock)" expect_ok 'Cartão Sem Vencimento - 2026-02-16' cards invoice -a 1003 --month 2026-02
# Dogfood 2026-10-19: --month on a card with a date-only proximoVencimento
# (2026-11-16) asked for the 15th in UTC-3; months 00/13 reached the API.
in_sao_paulo() { TZ=America/Sao_Paulo "$@"; }
step "cli cards invoice --month vencimento local (mock)" in_sao_paulo expect_ok 'Cartão Ouro - 2026-11-16 \(1 entries\)' cards invoice -a 1005 --month 2026-11
step "cli cards invoice --month 2026-13 recusado (mock)" expect_fail 'Invalid invoice month "2026-13"' cards invoice -a 1005 --month 2026-13
step "cli cards invoice --month 2026-00 recusado (mock)" expect_fail 'Invalid invoice month "2026-00"' cards invoice -a 1005 --month 2026-00
step "cli entries create --invoice 2026-13 recusado (mock)" expect_fail 'Invalid invoice month "2026-13"' entries create -a 1005 -d X -v 1 -c 10 --invoice 2026-13
# Same item, same date in both commands (Filipe, 2026-10-19): date is the due
# date, as in entries list; the purchase date is purchaseDate; dueDate stays.
step "cli cards invoice --json date = vencimento (mock)" in_sao_paulo expect_json 'd.length === 1 && d[0].id === 315471241 && d[0].date === "2026-11-16" && d[0].dueDate === "2026-11-16" && d[0].purchaseDate === "2025-11-19" && d[0].competenceDate === "2025-11-19"' cards invoice -a 1005 --month 2026-11 --json
# Invoice summary (resumo) in text mode; --json stays a bare array.
step "cli cards invoice resumo pago (mock)" expect_ok 'Paid +R\$.*100,00' cards invoice -a 1002 --month 2026-01
step "cli cards invoice resumo anterior (mock)"  expect_ok 'Previous invoice +-R\$.*100,00' cards invoice -a 1002 --month 2026-01
step "cli cards invoice resumo não conciliado (mock)" expect_ok 'Unreconciled +-R\$.*87,50' cards invoice -a 1002 --month 2026-01
step "cli cards invoice resumo fechamento (mock)" expect_ok 'Closing date +2026-01-08' cards invoice -a 1002 --month 2026-01
step "cli cards invoice resumo limite (mock)"     in_sao_paulo expect_ok 'Limit +R\$.*21\.804,00' cards invoice -a 1005 --month 2026-11
step "cli cards invoice resumo disponível (mock)" in_sao_paulo expect_ok 'Available +R\$.*21\.502,71' cards invoice -a 1005 --month 2026-11
step "cli cards invoice coluna da compra (mock)" in_sao_paulo expect_ok '2025-11-19 +│ Mac mini M4' cards invoice -a 1005 --month 2026-11
step "cli cards invoice --json segue array (mock)" expect_json 'Array.isArray(d) && d.length === 2 && d.every((e) => !("resumo" in e) && !("Paid" in e))' cards invoice -a 1002 --month 2026-01 --json
step "cli cards invoice --json --summary (mock)" expect_json 'd.invoice.total === -87.5 && d.invoice.unreconciled === -87.5 && d.invoice.paid === 100 && d.invoice.closingDate === "2026-01-08" && Array.isArray(d.entries) && d.entries.length === 2' cards invoice -a 1002 --month 2026-01 --json --summary
step "cli cards invoice --summary sem itens (mock)" expect_ok_without 'Unreconciled +-R\$.*87,50' 'Mercado' cards invoice -a 1002 --month 2026-01 --summary
step "cli cards invoice conta que não é cartão (mock)" expect_fail 'Account 1004 is not a credit card' cards invoice -a 1004
step "cli cards invoice --month inválido com --json (mock)" expect_json_error 'Invalid invoice month "2026-13"' cards invoice -a 1005 --month 2026-13 --json
step "cli entries list cartão mesma data do invoice (mock)" in_sao_paulo expect_json 'd.length === 1 && d[0].id === 315471241 && d[0].date === "2026-11-16" && d[0].competenceDate === "2025-11-19"' entries list -a 1005 -f 2026-11-01 -t 2026-11-30 --json
step "cli cards list --json campos do cartão (mock)" expect_json 'd.some((c) => c.id === 1005 && c.limit === 21804 && c.dueDay === 16 && c.nextDueDate === "2026-11-16" && c.nextClosingDate === "2026-11-05" && c.closingDaysBeforeDue === 11 && c.paymentAccountId === 1001) && d.every((c) => !("balance" in c))' cards list --json
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
# Finanças 2026-10-27: the web app only lists categories of the entry's type
# (md.js filterCats) and signs the value from the type (Tt); a mismatch is
# refused before the API, and the chosen type sets the sign and estorno.
step "cli entries create tipo e categoria divergentes (mock)" expect_fail 'is an expense, but the entry type is income' entries create -a 1001 -d X -v 1700 -c 10 -T income
step "cli entries update tipo e categoria divergentes (mock)" expect_fail 'is an expense, but the entry type is income' entries update 70 -T income
step "cli entries update estorno: tipo manda no sinal e no estorno (mock)" expect_json 'd.tipo === "r" && d.valor === 1700 && d.valorEfetivo === 1700 && d.estorno === false' entries update 71 -T income -c 20 -v 1700 --json
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
# update --account (#123): the NuCel fixed series moves to another account from
# this occurrence on; into a card the invoice is picked from the entry's date;
# a transfer moves origin/destination and refuses cards, as entries create.
step "cli entries update --account série (mock)" expect_json 'd.conta === 1004 && d.agendaId === 77 && d.parcela === "fixa" && d.scope === "following"' entries update 80 --account 1004 --scope following --json
step "cli entries update --account texto (mock)" expect_ok 'Account: 1004' entries update 80 --account 1004 --scope following
# Into a card the invoice is the web form's (from proximoVencimento, closing
# fechamento days before) and the plastic is the new card's holder, or null.
step "cli entries update --account cartão (mock)" expect_json 'd.conta === 1005 && d.dataCompetencia === "2026-11-10" && d.dataPrevista === "2026-12-16" && d.dataEfetiva === null && d.plastico === 7' entries update 70 --account 1005 -D 2026-11-10 --json
step "cli entries update --account cartão data passada (mock)" expect_json 'd.conta === 1005 && d.dataCompetencia === "2026-01-12" && d.dataPrevista === "2026-11-16"' entries update 70 --account 1005 --json
step "cli entries update --account cartão sem plástico (mock)" expect_json 'd.conta === 1002 && d.plastico === null' entries update 70 --account 1002 --json
step "cli entries update --account inexistente (mock)" expect_fail 'Unknown account: Inexistente' entries update 70 --account Inexistente
step "cli entries update --to-account fora de transferência (mock)" expect_fail 'to-account only applies to transfers' entries update 70 --to-account 1004
step "cli entries update transferência --account/--to-account (mock)" expect_json 'd.conta === 1004 && d.contaT === 1001' entries update 52 --account 1004 --to-account 1001 --json
step "cli entries update transferência mesma conta (mock)" expect_fail 'origin and destination would both be account 1004' entries update 52 --account 1004
step "cli entries update transferência com cartão (mock)" expect_fail 'credit card account are not supported' entries update 50 --to-account 1004
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
# Jardinagem 2026-10-19: money is signed everywhere (create/update/delete
# showed expenses without the minus) and tag resolution is shared.
step "cli entries create valor com sinal (mock)" expect_ok 'Value: -R\$.*30,00' entries create -a 1001 -d Feira -v 30 -c 10 -D 2026-01-05
step "cli entries create tag inexistente (mock)" expect_fail 'Unknown tag\(s\): nope' entries create -a 1001 -d Feira -v 30 -c 10 -g nope
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
printf '#!/bin/sh\necho "$@" >> "%s"\n' "$SANDBOX/update-args" >"$SANDBOX/fake-bun"; chmod +x "$SANDBOX/fake-bun"
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
  # The background child must run both steps, in this order: the old code lost
  # the install when the CLI exited before the remove finished.
  for _ in $(seq 50); do [ "$(sed -n '2p' "$SANDBOX/update-args" 2>/dev/null)" = 'install -g github:fm1randa/mdcli#v2099.1.1' ] && break; sleep 0.1; done
  [ "$(sed -n '1p' "$SANDBOX/update-args" 2>/dev/null)" = 'remove -g mdcli' ] \
    && [ "$(sed -n '2p' "$SANDBOX/update-args" 2>/dev/null)" = 'install -g github:fm1randa/mdcli#v2099.1.1' ] \
    && [ "$(wc -l < "$SANDBOX/update-args" 2>/dev/null | tr -d ' ')" = 2 ] \
    || { echo "update-args: $(cat "$SANDBOX/update-args" 2>/dev/null)"; return 1; }
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
step "cli update fora de instalação global" expect_fail 'mdcli is not installed globally' update

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "VERIFICAÇÃO FALHOU: ${FAILED[*]}"; exit 1
fi
echo "VERIFICAÇÃO OK"
