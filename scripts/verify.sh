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

# --- E2E da CLI -------------------------------------------------------------
SANDBOX=$(mktemp -d)
export MDCLI_CONFIG_DIR="$SANDBOX"
MOCK_PID=""
cleanup() { [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null; pkill -f "scripts/mock-api.ts" 2>/dev/null; rm -rf "$SANDBOX"; }
trap cleanup EXIT
CLI=(bun bin/cli.ts)

expect_ok() {   # expect_ok <regex> <args...>
  local re="$1"; shift
  local out; out=$("${CLI[@]}" "$@" </dev/null 2>&1) || { echo "saída: $out"; return 1; }
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
}
expect_fail() { # expect_fail <regex> <args...>
  local re="$1"; shift
  local out
  if out=$("${CLI[@]}" "$@" </dev/null 2>&1); then echo "deveria falhar: $out"; return 1; fi
  grep -Eq "$re" <<<"$out" || { echo "esperava /$re/ em: $out"; return 1; }
}

step "cli --version"        expect_ok '^1\.0\.0' --version
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
for _ in $(seq 50); do [ -s "$PORT_FILE" ] && break; sleep 0.1; done
export MDCLI_API_URL="http://127.0.0.1:$(head -1 "$PORT_FILE")/api"
cat >"$SANDBOX/mdcli.config.json" <<JSON
{"auth":{"apiKey":"verify-key","uid":"verify-uid"},"authMethod":"manual"}
JSON
step "cli accounts list (mock)"        expect_ok 'Nubank' accounts list
step "cli accounts list --json (mock)" bash -c '"$@" accounts list --json </dev/null | bun -e "const d=JSON.parse(await Bun.stdin.text()); if(!JSON.stringify(d).includes(\"Nubank\")) process.exit(1)"' _ "${CLI[@]}"

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "VERIFICAÇÃO FALHOU: ${FAILED[*]}"; exit 1
fi
echo "VERIFICAÇÃO OK"
