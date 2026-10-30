# ROUND RESULT: high=1 medium=0 low=0 taste=0, pushed 604933c

## Contexto

PR #155, rodada 4 (`fix/stdout-pipe-truncation`, HEAD `604933c`). Confirmado: `git fetch origin && git status -sb` = `HEAD` = `origin/fix/stdout-pipe-truncation`, sem divergir. A rodada 3 corrigiu a indentação de `process.exit(0)` em `src/commands/entries/import/run.ts`; esta rodada revisa a cobertura completa do fix.

## Achados

### Alta

- **Cancelamento interativo sem `flushStdout()`**: os 5 caminhos de `process.exit(0)` por cancelamento do usuário (`!confirmed`) estão protegidos apenas com `eslint-disable-next-line local/no-bare-process-exit`, sem `flushStdout()` antes, o que viola a própria regra criada pelo PR (`local/no-bare-process-exit`) e mantém a vulnerabilidade de truncação em pipes nesses caminhos:
  - `src/commands/accounts/delete.ts` (linha 35)
  - `src/commands/entries/delete.ts` (linha 44)
  - `src/commands/entries/import/run.ts` (linha 64) — corrigido na r3, mas ainda sem flush
  - `src/commands/sync/run.ts` (linha 71)
  - `src/commands/tags.ts` (linha 189)

  A regra de lint (`eslint-rules/no-bare-process-exit.js`) reporta `process.exit()` sem exceção; o `eslint-disable-next-line` silencia o erro, mas não corrige a causa raiz — o stdout ainda pode não ser drenado antes da saída. Todos os outros `process.exit()` protegidos (`bin/cli.ts`, `exitWithError()` em `src/utils/action.ts`) fazem `flushStdout()` antes. A consistência exige o mesmo para esses 5 cancelamentos.

  Correção sugerida: em cada caso, substituir o bloco de cancelamento por `await flushStdout(3000); process.exit(0);` (com o disable removido se o flush for feito antes). Como `flushStdout()` retorna `Promise<void>`, precisa ser `await` antes do `process.exit(0)`; se feito dentro de uma função assíncrona, funciona diretamente.

### Média / Baixa / Gosto

- Nenhum outro achado nos eixos (a) padrões (lint, typecheck, knip, testes não tautológicos, sem comentários desnecessários, limite de tamanho respeitado) e (b) especificação.
- `scripts/verify.sh`: passa nos passos executáveis; as 6 falhas de teste são pré-existentes e documentadas no PR.
- O teste de guarda (`test/stdout-flush-guard.test.ts`) é observável (falha sem o fix, passa com o fix) e não tautológico.
- A regra `local/no-bare-process-exit` é aplicada a `src/**/*.ts` e `bin/**/*.ts` e tem mensagem que cita o fix (`65536 bytes`).
- Nenhuma alteração na `README.md` exige atualização do `README.en.md` (não há mudança de conteúdo funcional documentado no PR).

## Evidência verificada

- Confirmação que todos os 5 `process.exit(0)` de cancelamento estão sem `flushStdout()`:
  - `accounts/delete.ts`: `logger.info(...)` → `process.exit(0)` direto (sem flush)
  - `entries/delete.ts`: `logger.info(...)` → `process.exit(0)` direto
  - `entries/import/run.ts`: `logger.info(...)` → `process.exit(0)` direto (linha corrigida na r3, mas ainda sem flush)
  - `sync/run.ts`: `logger.info(...)` → `process.exit(0)` direto
  - `tags.ts`: `logger.info(...)` → `process.exit(0)` direto
- Todos os outros `process.exit()` (`bin/cli.ts`, `src/utils/action.ts` via `exitWithError()`) estão protegidos corretamente com `flushStdout()`.
- Nenhum `process.exit()` adicional não coberto pelo PR foi introduzido.

## Correção necessária

Corrigir os 5 caminhos de cancelamento para fazer `await flushStdout(3000)` (ou similar) antes de `process.exit(0)`, garantindo que a saída não seja truncada em pipes mesmo quando o usuário cancela uma operação interativa. Remover o `eslint-disable-next-line local/no-bare-process-exit` após adicionar o flush (ou mantê-lo se a regra ainda for acionada por algum motivo estrutural).
