<!--
Antes de abrir uma PR, leia `AGENTS.md`. Cada PR deve resolver um problema de raiz,
não apenas adicionar compatibilidade. Escopo pequeno, evidência de verificação.
-->

## Problema

<!-- O que estava errado ou faltando. Uma ou duas frases. Inclua comportamento esperado e passos de reprodução quando relevante. -->

## Mudança

<!-- O que mudou e por quê (causa raiz, no caso de bug). Se abrange múltiplos componentes, explique por que as mudanças são necessárias para a mesma correção. -->

## Escopo

<!-- Link para a issue resolvida (`Closes #n`). Se não há issue prévia, explique por que o escopo é pequeno e óbvio. -->
Closes #n

## Checklist

- [ ] Se a mudança introduz ou altera um termo do domínio, o `GLOSSARY.md` foi atualizado neste PR.

## Verificação

<!-- Resultado observado (reprodução antes/depois, saída de `scripts/verify.sh`). "Testes passam" sozinho não basta. -->

- `scripts/verify.sh`: `VERIFICAÇÃO OK` / `VERIFICAÇÃO FALHOU`
- Reprodução antes:
- Reprodução depois:

## Prova

<!-- Obrigatória quando o PR muda arquivos em `src/`. Rode os mesmos comandos
     contra o mock (`bun scripts/mock-api.ts`) e uma config falsa em `/tmp`,
     nunca contra uma conta real. Cole o comando e a saída em cada bloco de
     código. O check `prova` reprova o PR sem a linha `Web:` e sem os dois
     blocos preenchidos. Se o PR muda `src/` ou `bin/`, inclua também a saída
     das 3 execuções de `bun scripts/new-tests-fail-on-main.ts --base
     <pre-fix> --files <test>`; uma execução vermelha isolada sob carga não
     prova nada (issue #235). -->

<!-- Paridade com a web (AGENTS.md, item 9): cite o trecho do bundle
     `$HOME/.mdcli-team/ref/mdb.js` que mostra o comportamento, ou escreva
     `Web: sem equivalente na web`. -->
Web:

### Antes (main)

<!-- Cole o comando e a saída na `main`, num bloco de código. -->

### Depois (branch)

<!-- Cole o comando e a saída na branch, num bloco de código. -->

<!-- Se usou um agente, finalize com o modelo e o harness (a ferramenta de agente) que fizeram o trabalho. -->
- Modelo: <!-- ex.: cliproxy/frontier, opencode/deepseek-v4.1-flash-free, claude-opus -->
- Harness: <!-- ex.: claude code, opencode, pi, t3/claude code, t3/opencode -->
