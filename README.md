**Português (Brasil)** · [English](README.en.md)

# mdcli

Cliente de linha de comando (CLI) não oficial do [Meu Dinheiro](https://meudinheiroweb.com.br), um app brasileiro de finanças pessoais.

## Instalação

> Requer o [Bun](https://bun.sh). O mdcli executa TypeScript diretamente e depende de APIs exclusivas do Bun, então não roda no Node.js puro.

### Global

```bash
bun install -g github:fm1randa/mdcli
```

#### Atualizações automáticas

Uma instalação global se mantém sempre na **release** mais recente (uma tag `vYYYY.M.D` com uma GitHub Release). Commits mesclados na `main` sem uma release não são instalados.

No máximo uma vez a cada 24 horas, o mdcli consulta o GitHub pela release mais recente (`api.github.com/repos/fm1randa/mdcli/releases/latest`, timeout de 1,5 s, sem token) e a compara com a versão instalada (o `package.json` da instalação). Se a release for mais nova, ele executa `bun install -g github:fm1randa/mdcli#<tag>` em segundo plano; a nova versão passa a ser usada a partir da próxima execução, que imprime uma linha no stderr, por exemplo `mdcli atualizado de 2026.10.13 para 2026.10.20`. O stdout nunca é afetado, então a saída de `--json` e `--csv` continua limpa.

A verificação é ignorada ao rodar a partir de um checkout do código-fonte, quando `CI` está definida e quando não há conexão; uma verificação ou atualização que falhe nunca faz o comando falhar. O horário da última verificação fica salvo em `update-check.json`, dentro do diretório de configuração (`MDCLI_CONFIG_DIR`, padrão `~/.config/mdcli`).

Para atualizar na hora (em primeiro plano, informando o resultado; funciona mesmo com as atualizações automáticas desligadas):

```bash
mdcli update
```

Para desligar as atualizações automáticas, defina a variável de ambiente:

```bash
export MDCLI_NO_AUTO_UPDATE=1
```

ou adicione `"autoUpdate": false` ao `~/.config/mdcli/mdcli.config.json`.

### A partir do código-fonte

```bash
gh repo clone fm1randa/mdcli
cd mdcli
bun install
bun dev --help
```

### Opcional: 1Password CLI

Para login automático quando a extração da sessão do navegador falhar, instale o [1Password CLI](https://developer.1password.com/docs/cli/get-started/):

```bash
# macOS
brew install 1password-cli

# Linux
# Veja https://developer.1password.com/docs/cli/get-started/#install
```

Crie um item no 1Password com os seguintes campos:
- `username` - seu e-mail de login
- `password` - sua senha
- `otp` - senha de uso único (configurada como TOTP)

### Opcional: chave de API do 2Captcha

Se a página de login mostrar um desafio reCAPTCHA, você pode configurar uma chave de API do [2Captcha](https://2captcha.com/) para resolvê-lo automaticamente:

```bash
mdcli auth login --captcha-key <your-2captcha-api-key>
```

A chave de API é salva na configuração e reutilizada nos próximos logins.

## Autenticação

A API autentica cada requisição com dois headers, `Mdapikey` e `Mduid`, além de um bearer token quando houver um. Todos os métodos de login abaixo acabam salvando esses valores em `~/.config/mdcli/mdcli.config.json`.

### Fluxo padrão

```bash
mdcli auth login
```

Sem flags, a CLI tenta primeiro o método que funcionou da última vez (uma sessão do Chrome na primeira execução). Se ele falhar e você estiver em um terminal interativo, ela oferece os outros métodos. Fora de um terminal (scripts, CI), ela sai com um erro listando as flags explícitas em vez de ficar esperando uma entrada.

### Sessão do navegador

Se você já está logado no Meu Dinheiro em um navegador, a CLI pode reaproveitar essa sessão:

```bash
mdcli auth login --session chrome
mdcli auth login --session edge
mdcli auth login --session firefox
```

No macOS, ler um perfil do navegador exige **Acesso Total ao Disco** para o app de terminal em que você roda o `mdcli` (Ajustes do Sistema → Privacidade e Segurança → Acesso Total ao Disco). Reinicie o terminal depois de ativar.

### Entrada manual

Copie os headers pelo DevTools do navegador: abra a aba **Network** (Rede), escolha qualquer requisição para `/api/` e procure em **Request Headers** (Cabeçalhos de solicitação).

```bash
mdcli auth login --manual
```

Serão pedidos o `Mdapikey`, o `Mduid` e o bearer token (o valor de `Authorization` sem o `Bearer `). Esse método não automatiza um navegador, então funciona mesmo onde os outros são bloqueados.

### 1Password

```bash
mdcli auth login --item "My Meu Dinheiro"
```

O nome do item é salvo e reutilizado nos logins seguintes. Se você rodar `mdcli auth login` sem `--item` e ainda não houver item salvo, o nome será pedido, com `MeuDinheiroWeb` como padrão.

### Login pelo navegador

Abre o Chrome ou o Edge (o que estiver instalado) para você fazer login manualmente:

```bash
mdcli auth login --browser
```

A página de login é protegida pelo Cloudflare, que pode rejeitar logins vindos de um navegador automatizado. Se aparecer "Falha na verificação", use `--session` ou `--manual`.

### Solução de problemas

```bash
mdcli auth doctor
```

Verifica se os perfis do Chrome, do Edge e do Firefox existem e podem ser lidos, se o 1Password CLI está instalado e se você está autenticado no momento.

Quando a API rejeita as credenciais salvas, a CLI tenta de novo com o método do seu último login. Para logins manuais e pelo navegador, ela pede que você rode `mdcli auth login` de novo.

### Verificar status

```bash
mdcli auth status
```

Mostra o status da sua autenticação, incluindo o método usado (sessão do navegador, 1Password etc.).

### Logout

```bash
# Remove a sessão salva
mdcli auth logout

# Também apaga o item do 1Password e a chave do 2Captcha salvos
mdcli auth logout --all
```

## Uso

### Identificando contas, categorias e tags

`--account`, `--category` e `--tag` aceitam três formas, tentadas nesta ordem:

1. **ID numérico** — ex.: `--account 1167419`. O mais rápido, sem precisar de rede.
2. **Alias** — um nome curto que você associou a um ID com `mdcli accounts alias add`. Fica salvo localmente em `~/.config/mdcli/mdcli.config.json`.
3. **Nome exato** — o nome real da entidade, como mostrado por `mdcli accounts list`, comparado sem diferenciar maiúsculas de minúsculas. Os nomes são buscados em um cache em disco de 30 dias, invalidado automaticamente quando uma requisição que usou um ID do cache retorna um status fora da faixa 2xx.

Quando a mesma string corresponde a um alias e a um nome, o alias vence, então seus atalhos sempre têm prioridade.

```bash
# Autentica (por padrão, extrai a sessão do Chrome)
mdcli auth login

# Ou use o 1Password
mdcli auth login --item "My Meu Dinheiro"

# Lista as contas
mdcli accounts list --active

# Lista os tipos de conta aceitos por --type
mdcli accounts types

# Cria uma conta (--type aceita o ID ou o nome mostrado em "accounts types")
mdcli accounts create --name "Nubank" --type "Conta Corrente" --bank nubank --balance 0

# Atualiza uma conta (só os campos informados são alterados)
mdcli accounts update 1167419 --name "Nubank PF"

# Arquiva (desativa) ou reativa uma conta
mdcli accounts update 1167419 --inactive
mdcli accounts update 1167419 --active

# Exclui uma conta (pede confirmação)
mdcli accounts delete 1167419

# Cria um alias para acesso rápido
mdcli accounts alias add --id 1167419 --name mp

# Lista lançamentos usando o alias
mdcli entries list --account mp --from 2024-01-01 --to 2024-01-31

# Lista lançamentos usando o nome exato da conta (sem diferenciar maiúsculas de minúsculas)
mdcli entries list --account "Nubank - Conta Corrente" --from 2024-01-01 --to 2024-01-31

# O Meu Dinheiro carrega lançamentos até 2031-12-31; um --to posterior é recusado
# antes de qualquer requisição. Erros vão para o stderr com código de saída 1; com
# --json eles também são JSON ({"error": "..."}), então o stdout só contém o resultado.
mdcli entries list --account mp --from 2026-11-01 --to 2031-12-31 --json

# Exporta lançamentos para CSV (todas as páginas, com nomes de conta, categoria,
# conta da transferência e tags, datas efetiva/de competência, repetição,
# observações e número do documento; date é a data prevista, a que --from/--to filtram)
mdcli entries list --account mp --from 2026-01-01 --to 2026-03-31 --csv > entries.csv

# As compras de um cartão de crédito, lidas das faturas que vencem no período (a
# listagem do extrato deixa as compras no cartão de fora); datadas pelo vencimento
# da fatura, com a data da compra em competenceDate
mdcli entries list --account <cardId> --from 2026-10-01 --to 2026-12-31 --json

# Conta corrente sem a projeção da fatura do cartão (tipo invoice, sem ID) que a
# API adiciona para cada cartão pago por ela; também no summary
mdcli entries list --account mp --from 2026-11-01 --to 2026-11-30 --no-invoices

# Só parcelados e séries fixas (o filtro Repetição do app web);
# também no summary. Valores: single, installment, fixed
mdcli entries list --account mp --repetition installment,fixed

# Todos os campos de um lançamento; --json é o formato da listagem, --raw a resposta da API
mdcli entries show 12345
mdcli entries show 12345 --raw

# Receitas x despesas por categoria no mês atual (transferências ficam de fora)
mdcli entries summary --account mp,nubank

# Mês a mês em um trimestre, ou por conta; --json/--csv também funcionam aqui
mdcli entries summary --account mp --from 2026-01-01 --to 2026-03-31 --by month
mdcli entries summary --account mp,nubank --by account --include-transfers

# Deixa categorias (e suas subcategorias) de fora, ex.: uma fatura de cartão paga
# pela conta corrente, que contaria em dobro as compras já lançadas no cartão
mdcli entries summary --account mp,nubank --exclude-category "Pagamento de cartão"

# Cria um lançamento
mdcli entries create --account mp --description "Groceries" --value 150 --category food

# Uma compra no cartão vai para a fatura aberta (ou --invoice YYYY-MM); o ID
# impresso é o do lançamento na fatura, que serve para update/show/delete
mdcli entries create --account <cardId> --description "Voo" --value 900 --category travel

# Cria um lançamento usando o nome da conta em vez de um alias
mdcli entries create --account "Mercado Pago" --description "Groceries" --value 150 --category food

# Transferência entre duas contas (--account é a origem); a categoria padrão é
# a categoria de transferência do sistema, como no app web. Transferências de ou
# para um cartão de crédito, ou entre moedas, ainda não são suportadas.
mdcli entries create --account mp --type transfer --to-account nubank --description "Reserva" --value 500

# Parcelado: 1200 dividido em 10 parcelas mensais; a primeira absorve o centavo
# do arredondamento. --per-installment faz de --value o valor de cada parcela,
# --repeat/--frequency definem o intervalo, --first-installment o número inicial.
mdcli entries create --account mp --description "Notebook" --value 1200 --category tech --installments 10

# Série fixa a cada 2 meses, 6 vezes (--frequency e --times podem ser combinados)
mdcli entries create --account mp --description "Academia" --value 90 --category gym --repeat monthly --frequency 2 --times 6

# Pendente (Confirmado desligado, ainda sem data efetiva). A API o mostra como
# pendente até hoje e como agendado para uma data futura.
mdcli entries create --account mp --description "IPVA" --value 800 --category car --date 2027-01-20 --pending

# Confirmado, mas não conciliado (sem flag de status, o create concilia).
# Compras no cartão de crédito sempre ficam não conciliadas na fatura.
mdcli entries create --account mp --description "Feira" --value 30 --category food --confirmed

# Atualiza um lançamento (só os campos informados são alterados)
mdcli entries update 12345 --value 200 --category food

# Volta um lançamento confirmado para pendente (limpa a data e o valor
# efetivos); --confirmed o confirma de novo, --reconciled o concilia
mdcli entries update 12345 --pending

# Atualiza uma transferência por qualquer um dos lados do par - os dois mudam juntos.
# Uma transferência não pode virar despesa nem receita.
mdcli entries update 12345 --value 200

# Série recorrente (fixa ou parcelada): por padrão só esta ocorrência muda, e ela
# sai da série (um aviso no stderr informa isso). Uma ocorrência pendente ou
# agendada continua não confirmada, a menos que você passe --confirmed ou --reconciled.
mdcli entries update 12345 --date 2027-01-25 --scope this
# Esta ocorrência e as seguintes; as anteriores não são alteradas
mdcli entries update 12345 --date 2027-01-25 --scope following

# Muda a conta (ID, alias ou nome, como no create); numa série, junto com --scope.
# Passar a conta atual não é erro: o lançamento é salvo como está, como na web.
mdcli entries update 12345 --account nubank --scope following
# Para um cartão de crédito, como na web: a compra vai para a fatura da data do
# lançamento (ou de --date) contada a partir do próximo vencimento do cartão
# (uma data anterior cai na próxima fatura), sem data efetiva, no plástico
# titular do cartão. Ao sair do cartão, uma compra não conciliada fica pendente
# na data da compra. Lançamentos de fatura fechada não mudam de conta (a web
# também bloqueia).
mdcli entries update 12345 --account <cardId>
# Transferência: --account muda a origem e --to-account o destino; as duas
# contas têm de ser diferentes, e cartão de crédito ainda não é suportado
mdcli entries update 12345 --to-account reserva

# Exclui um lançamento
mdcli entries delete 12345

# Exclui esta ocorrência de uma série recorrente e as seguintes
# (o "Neste e em todos na sequência" do app web); o padrão é --scope this
mdcli entries delete 12345 --scope following

# Lista os cartões de crédito (o --json tem limit, dueDay, nextDueDate, nextClosingDate,
# closingDaysBeforeDue e paymentAccountId; sem saldo, que não significa nada
# para um cartão). dueDay/nextDueDate/nextClosingDate null: a API não tem o próximo
# vencimento e a CLI conta as faturas da primeiraFatura (veja docs/cards-json.md)
mdcli cards list --active

# Mostra uma fatura do cartão de crédito (por padrão, a atual/próxima): o resumo
# que o web mostra (vencimento e fechamento, fatura anterior, pago, pagamentos
# agendados, despesas, receitas, total, a pagar, conciliado/não conciliado, limite,
# disponível) e depois os itens pela data da compra. Linhas que a API não envia ficam de fora.
mdcli cards invoice --account <cardId> --month 2026-02

# Mostra uma fatura do cartão de crédito usando o nome exato do cartão
mdcli cards invoice --account "Itaú Personalité" --month 2026-02

# No --json (um array de itens), date é o vencimento da fatura, a mesma data que
# entries list --json mostra para o item; purchaseDate é quando foi comprado,
# dueDate repete date e competenceDate vem junto
mdcli cards invoice --account <cardId> --month 2026-02 --json

# Só o resumo, sem a tabela de itens
mdcli cards invoice --account <cardId> --month 2026-02 --summary

# Resumo e itens em um único objeto JSON: { "invoice": {...}, "entries": [...] }.
# invoice tem id (só faturas fechadas), closed, dueDate, closingDate,
# previousInvoice, paid, scheduledPayments, expenses, income, total, toPay,
# reconciled, unreconciled, limit e available. Os valores são em R$ com os sinais
# da API (reconciled/unreconciled são R$, não contagens); um campo que a API não
# envia vem null. entries é o mesmo array que o --json imprime sozinho.
mdcli cards invoice --account <cardId> --month 2026-02 --json --summary

# Mostra as próximas parcelas de um cartão
mdcli cards future --account <cardId>

# Lista só as categorias de despesa
mdcli categories list --type expense

# Cria uma categoria e depois uma subcategoria (herda o tipo da categoria pai)
mdcli categories create --name "Pets" --type expense
mdcli categories create --name "Vet" --parent "Pets"

# Renomeia, arquiva ou reativa uma categoria
mdcli categories update 12345 --name "Pet care"
mdcli categories update 12345 --inactive

# Exclui uma categoria; seus lançamentos vão para --move-to (precisa ser do mesmo tipo).
# Categorias com subcategorias precisam ter essas removidas antes.
mdcli categories delete 12345 --move-to "Outros"

# Cria uma tag (a cor é opcional; o padrão é cinza)
mdcli tags create --name "Travel" --color "#FF6600"

# Atualiza uma tag (só os campos informados são alterados)
mdcli tags update 12345 --color "#00AAFF"

# Arquiva (desativa) ou reativa uma tag
mdcli tags update 12345 --inactive
mdcli tags update 12345 --active

# Exclui uma tag
mdcli tags delete 12345
```

## Desenvolvimento

```bash
scripts/verify.sh   # verificação completa: install, typecheck, lint, knip, testes, CLI de ponta a ponta
```

O `scripts/verify.sh` é a verificação oficial: o CI o executa em todo pull request e em todo push na `main`, e a proteção de branch exige que ele passe antes do merge. Ele passa quando sai com código 0 e imprime `VERIFICAÇÃO OK` como última linha.

Durante o desenvolvimento, você pode rodar as etapas individualmente:

```bash
bun run test        # suíte de testes
bun run typecheck
bun run lint
bun run knip        # arquivos, dependências e exports não usados
```

Os testes em `test/` executam a CLI real como subprocesso contra um mock local da API do Meu Dinheiro (`MDCLI_API_URL` sobrescreve a URL base da API), com `HOME` apontando para um diretório temporário. `MDCLI_CONFIG_DIR` sobrescreve o diretório de configuração; o `bunfig.toml` pré-carrega o `test/setup.ts`, que o aponta para um diretório temporário durante toda a execução, então os testes em processo também ficam isolados. Eles nunca tocam na sua configuração real, nos perfis do navegador nem na API de verdade, e verificam tanto o que a CLI imprime quanto as requisições exatas que ela envia.

## Funcionalidades

### Autenticação
| Funcionalidade | Status |
|---------|--------|
| Extração da sessão do navegador (Chrome/Edge/Firefox) | Pronto |
| Login pelo navegador (captura automática) | Pronto |
| Login automático (1Password CLI) | Pronto |
| Lembrar o último método de login | Pronto |
| Renovação automática em caso de 401 (usando o último método) | Pronto |
| Entrada manual do token | Pronto |
| Verificação de status | Pronto |
| Diagnóstico (`auth doctor`) | Pronto |
| Logout | Pronto |

### Contas
| Funcionalidade | Status |
|---------|--------|
| Listar | Pronto |
| Filtrar por ativas | Pronto |
| Saída em JSON | Pronto |
| Aliases (add/list/rm/update) | Pronto |
| Listar tipos | Pronto |
| Criar | Pronto |
| Atualizar | Pronto |
| Excluir | Pronto |
| Arquivar | Pronto |

### Categorias
| Funcionalidade | Status |
|---------|--------|
| Listar | Pronto |
| Filtrar por ativas | Pronto |
| Filtrar por tipo | Pronto |
| Saída em JSON | Pronto |
| Aliases (add/list/rm/update) | Pronto |
| Criar (incl. subcategorias) | Pronto |
| Atualizar | Pronto |
| Excluir (move os lançamentos para outra categoria) | Pronto |
| Arquivar | Pronto |

### Tags
| Funcionalidade | Status |
|---------|--------|
| Listar | Pronto |
| Filtrar por ativas | Pronto |
| Saída em JSON | Pronto |
| Aliases (add/list/rm/update) | Pronto |
| Criar | Pronto |
| Atualizar | Pronto |
| Excluir | Pronto |
| Arquivar | Pronto |

### Lançamentos
| Funcionalidade | Status |
|---------|--------|
| Listar por conta | Pronto |
| Filtrar por período | Pronto |
| Filtrar por status | Pronto |
| Filtrar por tipo | Pronto |
| Filtrar por categoria | Pronto |
| Filtrar por tag | Pronto |
| Filtrar por palavras-chave | Pronto |
| Filtrar por valor | Pronto |
| Saída em JSON | Pronto |
| Exportação para CSV | Pronto |
| Todas as páginas (sem o limite de 200 lançamentos) | Pronto |
| Resumo por categoria/mês/conta | Pronto |
| Excluir categorias do resumo (`--exclude-category`) | Pronto |
| Suporte a alias (conta/categoria/tag) | Pronto |
| Filtrar por repetição (`--repetition single,installment,fixed`) | Pronto |
| Deixar de fora as projeções de fatura do cartão (`--no-invoices`) | Pronto |
| Compras no cartão no list/summary (lidas das faturas) | Pronto |
| Mostrar um lançamento (`entries show`, `--json`/`--raw`) | Pronto |
| Criar (único) | Pronto |
| Criar (recorrente, `--repeat`/`--frequency`/`--times`) | Pronto |
| Criar parcelado (`--installments`, `--per-installment`, `--first-installment`) | Pronto |
| Criar transferência (`-T transfer --to-account`) | Pronto |
| Status ao criar/atualizar (`-p/--pending`, `--confirmed`, `-r/--reconciled` no update) | Pronto |
| Compra no cartão de crédito em uma fatura escolhida (`--invoice`) | Pronto |
| Atualizar | Pronto |
| Atualizar/excluir uma ocorrência da série (`--scope this\|following`) | Pronto |
| Mudar a conta (`--account`; transferência: `--account`/`--to-account`) | Pronto |
| Excluir | Pronto |

### Cartões
| Funcionalidade | Status |
|---------|--------|
| Listar | Pronto |
| Filtrar por ativos | Pronto |
| Saída em JSON | Pronto |
| Fatura (por mês) | Pronto |
| Itens da fatura com datas de vencimento, compra e competência (`--json`, `date` = vencimento) | Pronto |
| Resumo da fatura (fechamento, fatura anterior, pago, a pagar, conciliado, limite, disponível) | Pronto (texto; `--summary`; `--json --summary`) |
| Configurações do cartão no `cards list --json` (limite, datas de vencimento/fechamento, conta de pagamento) | Pronto |
| Parcelas futuras | Pronto |
