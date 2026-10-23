# `cards list --json`

Um array com um objeto por cartão de crédito:

| Campo | Tipo | Origem na API | Significado |
|-------|------|---------------|-------------|
| `id` | número | `id` | ID da conta do cartão (o que vai em `-a`) |
| `name` | texto | `nome` | Nome do cartão |
| `type` | texto | `tipo` | Tipo da conta |
| `bank` | texto ou `null` | `banco.nome` | Banco |
| `active` | booleano | `status` | Cartão ativo |
| `closed` | booleano | `encerrada` | Cartão encerrado |
| `limit` | número ou `null` | `limite` | Limite |
| `dueDay` | número ou `null` | dia de `proximoVencimento` | Dia do mês em que a fatura vence |
| `nextDueDate` | `YYYY-MM-DD` ou `null` | `proximoVencimento` | Vencimento da próxima fatura |
| `nextClosingDate` | `YYYY-MM-DD` ou `null` | `proximoFechamento` | Fechamento da próxima fatura |
| `closingDaysBeforeDue` | número ou `null` | `fechamento` | Quantos dias antes do vencimento a fatura fecha |
| `paymentAccountId` | número ou `null` | `contada` | Conta que paga a fatura |

Não há saldo: para um cartão, o `saldoUltimoExtrato` da API é o número do
extrato do Open Finance, não o que se deve.

## `dueDay`, `nextDueDate` e `nextClosingDate` nulos

Esses campos são `null` quando a API não manda `proximoVencimento` (e
`proximoFechamento`) para o cartão, como num cartão novo. O `--json` mostra o
que a API diz e não preenche esses campos.

Mesmo assim, as faturas desse cartão funcionam: `cards invoice`, `entries list`
e `entries create` contam as faturas a partir do vencimento da primeira fatura
(`GET /v1/cartoes/<id>/primeiraFatura`), e cada fatura traz a sua data de
fechamento. Para ver esse vencimento, rode `mdcli cards invoice -a <id>` sem
`--month`, que mostra a primeira fatura; com `--month`, o vencimento cai no dia
da primeira fatura.
