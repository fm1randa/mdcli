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

## Verificação

<!-- Resultado observado (reprodução antes/depois, saída de `scripts/verify.sh`). "Testes passam" sozinho não basta. -->

- `scripts/verify.sh`: `VERIFICAÇÃO OK` / `VERIFICAÇÃO FALHOU`
- Reprodução antes:
- Reprodução depois:

<!-- Se usou um agente, finalize com o modelo e o harness (a ferramenta de agente) que fizeram o trabalho. -->
- Modelo: <!-- ex.: cliproxy/frontier, opencode/deepseek-v4.1-flash-free, claude-opus -->
- Harness: <!-- ex.: claude code, opencode, pi, t3/claude code, t3/opencode -->
