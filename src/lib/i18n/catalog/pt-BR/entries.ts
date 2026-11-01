/** Entries, in Brazilian Portuguese. */

export const ptBREntries = {
  // --- Entries -------------------------------------------------------------------
  entriesManageDescription: () => 'Gerenciar os lançamentos',
  entriesListDescription: () => 'Listar os lançamentos de uma ou mais contas',
  entriesListCsvOption: () => 'Saída em CSV (com os nomes das contas e das categorias)',
  entriesSummaryDescription: () =>
    'Total de receitas e despesas agrupado por categoria, mês ou conta',
  entriesSummaryByOption: () => 'Agrupar por: category, month ou account',
  entriesSummaryIncludeTransfersOption: () =>
    'Contar as transferências entre contas (deixadas de fora por padrão)',
  entriesShowDescription: () => 'Mostrar todos os campos de um lançamento',
  entriesShowJsonOption: () =>
    'Saída do lançamento normalizado em JSON (os mesmos campos de list --json)',
  entriesShowRawOption: () => 'Saída do lançamento exatamente como a API retorna',
  entriesCreateDescription: () => 'Criar um novo lançamento',
  entriesCreateAccountOption: () =>
    'ID da conta, alias ou nome exato (sem diferenciar maiúsculas/minúsculas); numa transferência, a conta de origem',
  entriesCreateDescriptionOption: () => 'Descrição do lançamento',
  entriesCreateValueOption: () =>
    'Valor do lançamento (número positivo, ex.: 10.50 ou 10,50); com --installments, o total, a menos que --per-installment',
  entriesCreateTypeOption: () => 'Tipo do lançamento: expense, income, transfer (padrão: expense)',
  entriesCreateToAccountOption: () =>
    'Transferências: ID da conta de destino, alias ou nome exato (obrigatório com -T transfer)',
  entriesCreateCategoryOption: () =>
    'ID da categoria, alias ou nome exato (sem diferenciar maiúsculas/minúsculas) (obrigatório; transferências usam a categoria de transferência por padrão)',
  entriesCreateDateOption: () =>
    'Data do lançamento (AAAA-MM-DD); padrão: hoje; com --installments, a primeira parcela',
  entriesTagsOption: () =>
    'ID(s) da(s) tag(s), alias(es) ou nome(s) exato(s) (sem diferenciar maiúsculas/minúsculas), separados por vírgula',
  entriesNotesOption: () => 'Observações adicionais',
  entriesCreatePendingOption: () =>
    'Criar como não confirmado (Confirmado desligado no app web, sem data efetiva): pendente até hoje, agendado para uma data futura',
  entriesCreateConfirmedOption: () => 'Criar como confirmado, não conciliado (padrão: conciliado)',
  entriesScheduledAliasOption: () => 'Alias obsoleto de --pending',
  entriesCreateRepeatOption: () =>
    'Recorrência: daily, weekly, monthly, yearly (ou d, w, m, y); com --installments, o intervalo (padrão: monthly)',
  entriesCreateFrequencyOption: () =>
    'Repetir a cada N intervalos, ex.: --frequency 2 = a cada 2 meses (padrão: 1)',
  entriesCreateTimesOption: () =>
    'Série fixa: total de ocorrências, ex.: --times 6 = 6 vezes e para (padrão: infinito)',
  entriesCreateInstallmentsOption: () =>
    'Série parcelada: dividir --value em N parcelas (N >= 2)',
  entriesCreateFirstInstallmentOption: () =>
    'Parcelas: número da primeira parcela, como no app web (padrão: 1)',
  entriesCreatePerInstallmentOption: () =>
    'Parcelas: --value é o valor de cada parcela, não o total',
  entriesCreateInvoiceOption: () =>
    'Cartões de crédito: mês da fatura em que lançar (padrão: a fatura em que a data cai)',
  entriesUpdateDescription: () =>
    'Atualizar um lançamento existente (atualização parcial: só envie os campos que deseja alterar)',
  entriesUpdateAccountOption: () =>
    'Mover o lançamento para esta conta: ID, alias ou nome exato (sem diferenciar maiúsculas/minúsculas); numa transferência, a conta de origem',
  entriesUpdateToAccountOption: () =>
    'Transferências: mover o destino para esta conta (ID, alias ou nome exato)',
  entriesUpdateValueOption: () => 'Valor do lançamento (ex.: 10.50 ou 10,50)',
  entriesUpdateTypeOption: () => 'Tipo do lançamento: expense, income, transfer',
  entriesUpdateCategoryOption: () =>
    'ID da categoria, alias ou nome exato (sem diferenciar maiúsculas/minúsculas)',
  entriesUpdateDateOption: () => 'Data do lançamento (AAAA-MM-DD)',
  entriesUpdatePendingOption: () =>
    'Definir como não confirmado: limpa a data e o valor efetivos (pendente até hoje, agendado para uma data futura)',
  entriesUpdateConfirmedOption: () =>
    'Definir como confirmado, não conciliado (confirma um lançamento pendente ou agendado)',
  entriesUpdateReconciledOption: () => 'Definir como conciliado',
  entriesDeleteDescription: () => 'Excluir um lançamento',
  entriesDeleteSkipConfirmationOption: () => 'Pular a confirmação',
  entriesFilterAccountOption: () =>
    'ID(s) da(s) conta(s), alias(es) ou nome(s) exato(s) (sem diferenciar maiúsculas/minúsculas), separados por vírgula',
  entriesFilterFromOption: () =>
    'Data inicial (AAAA-MM-DD); padrão: primeiro dia do mês atual',
  entriesFilterToOption: () =>
    'Data final (AAAA-MM-DD); padrão: último dia do mês atual (limite da API: 2031-12-31)',
  entriesFilterStatusOption: () =>
    'Filtrar por status: pending, confirmed, reconciled, scheduled (ou máscara de bits 0-15)',
  entriesFilterTypeOption: () =>
    'Filtrar por tipo: expense, income, transfer-out, transfer-in (ou máscara de bits 0-15)',
  entriesFilterRepetitionOption: () =>
    'Filtrar por repetição: single, installment, fixed (ou máscara de bits 0-7)',
  entriesFilterCategoryOption: () =>
    'Filtrar por ID(s) da(s) categoria(s), alias(es) ou nome(s) exato(s) (sem diferenciar maiúsculas/minúsculas), separados por vírgula',
  entriesFilterTagOption: () =>
    'Filtrar por ID(s) da(s) tag(s), alias(es) ou nome(s) exato(s) (sem diferenciar maiúsculas/minúsculas), separados por vírgula',
  entriesFilterKeywordsOption: () => 'Buscar por palavras-chave',
  entriesFilterValueOption: () => 'Filtrar por valor',
  entriesFilterExcludeCategoryOption: () =>
    'Deixar de fora estas categorias e suas subcategorias, separadas por vírgula',
  entriesFilterNoInvoicesOption: () =>
    'Omitir as projeções de fatura do cartão de crédito (API faturas: false; o padrão as inclui)',
  errorInvalidFilterDate: (flag: string, value: string) =>
    `Data ${flag} inválida: ${value}. Use AAAA-MM-DD.`,
  errorPastLastLoadableDate: (to: string, last: string) =>
    `--to ${to} passa de ${last}, a última data para a qual o Meu Dinheiro carrega lançamentos. Use --to ${last} ou uma data anterior.`,
  errorUnknownFilterValue: (label: string, unknown: string, valid: string) =>
    `${label} desconhecido(s): ${unknown}. Válidos: ${valid}`,
  filterLabelStatus: () => 'Status',
  filterLabelType: () => 'Tipo',
  filterLabelRepetition: () => 'Repetição',
  errorAccountRequired: () =>
    'É necessário informar ao menos um ID de conta ou alias. Use --account <id> ou --account <id1,id2,...>',
  errorUnknownAccounts: (list: string) => `Conta(s) desconhecida(s): ${list}`,
  errorUnknownCategories: (list: string) => `Categoria(s) desconhecida(s): ${list}`,
  errorUnknownCategoriesExclude: (list: string) =>
    `Categoria(s) desconhecida(s) em --exclude-category: ${list}`,
  errorInvalidValue: (value: string) =>
    `Valor inválido "${value}". Use um número como 10, 10.50 ou 10,50.`,
  errorJsonOrCsv: () => 'Use --json ou --csv, mas não os dois.',
  entriesListHeader: (count: number, total: string) => `Lançamentos (${count}) | Total: ${total}`,
  errorInvalidBy: (value: string) => `--by inválido "${value}". Use category, month ou account.`,
  labelNoCategory: () => '(sem categoria)',
  summaryGroupCategory: () => 'Categoria',
  summaryGroupMonth: () => 'Mês',
  summaryGroupAccount: () => 'Conta',
  entriesSummaryHeader: (by: string, from: string, to: string) => `Resumo por ${by} | ${from} a ${to}`,
  entriesExcludedByCategory: (count: number) =>
    `${count} lançamento${count === 1 ? '' : 's'} deixado${count === 1 ? '' : 's'} de fora por --exclude-category.`,
  entriesSkippedTransfers: (count: number) =>
    `${count} transferência${count === 1 ? '' : 's'} deixada${count === 1 ? '' : 's'} de fora. Use --include-transfers para contá-las.`,
  entriesSkippedPayments: (count: number) =>
    `${count} pagamento${count === 1 ? '' : 's'} de cartão deixado${count === 1 ? '' : 's'} de fora do resumo.`,
  entriesSkippedInvoices: (count: number) =>
    `${count} projeç${count === 1 ? 'ão' : 'ões'} de fatura deixada${count === 1 ? '' : 's'} de fora do resumo.`,
  notReturnedByApi: () => '(não retornado pela API)',
  errorJsonOrRaw: () => 'Use --json ou --raw, mas não os dois.',
  errorUnknownTags: (list: string) => `Tag(s) desconhecida(s): ${list}`,
  scopeThisAndFollowing: () => 'esta e as seguintes',
  scopeThisOnly: () => 'apenas esta',
  scopeOptionDescription: (verb: string) =>
    `Para uma ocorrência de uma série recorrente: ${verb} só esta (this, o padrão) ou esta e as seguintes (following)`,
  scopeVerbChange: () => 'alterar',
  scopeVerbDelete: () => 'excluir',
  errorNotPartOfSeries: (id: number) =>
    `O lançamento ${id} não faz parte de uma série recorrente, então --scope following não se aplica.`,
  errorSeriesOccurrenceId: (id: string) =>
    `"${id}" é o ID de uma ocorrência da série, não de um lançamento. ` +
    'Para uma compra no cartão, encontre o ID do lançamento com: mdcli entries list -a <cartão> --json (ou mdcli cards invoice -a <cartão> --json)',
  errorInvalidEntryId: () => 'ID do lançamento inválido. Deve ser um número.',
  errorInvoiceNotFound: (date: string) =>
    `Não foi possível encontrar a fatura de ${date}. Informe-a com --invoice AAAA-MM.`,
  warningCardEntryIdNotFound: (id: string, dueDate: string, cardId: number, month: string) =>
    `⚠ A API respondeu com "${id}", que não é um ID de lançamento, e a compra não foi encontrada na fatura de ${dueDate}. ` +
    `Encontre o ID com: mdcli cards invoice -a ${cardId} --month ${month} --json`,
  warningScheduledEntryIdNotFound: (id: string, accountId: number) =>
    `⚠ A API respondeu com "${id}", que não é um ID de lançamento, e o lançamento agendado não foi encontrado nos lançamentos da conta. ` +
    `Encontre o ID com: mdcli entries list -a ${accountId} --json`,
  errorUnknownEntryType: (input: string) =>
    `Tipo desconhecido: ${input}. Válidos: expense (d), income (r), transfer (t)`,
  errorTransferNeedsDestination: () =>
    'Uma transferência precisa de uma conta de destino. Use --to-account <id|alias> (--account é a origem).',
  errorToAccountOnlyTransfers: () => '--to-account só se aplica a transferências (-T transfer).',
  errorCategoryRequiredForEntry: () =>
    'É necessário informar uma categoria para criar um lançamento. Use -c, --category <id|alias>. Veja as categorias disponíveis com: mdcli categories list',
  errorPendingOrConfirmed: () => 'Use --pending ou --confirmed, mas não os dois.',
  errorInvalidDate: () => 'Data inválida. Use AAAA-MM-DD (ex.: 2026-10-03).',
  errorInvalidDateWithValue: (value: string) => `Data inválida "${value}". Use AAAA-MM-DD (ex.: 2026-10-03).`,
  warningAccountNotFoundInList: (id: number) =>
    `A conta ${id} não foi encontrada na lista de contas. Criando o lançamento sem os campos de cartão de crédito.`,
  errorInvoiceOnlyCards: () => '--invoice só se aplica a contas de cartão de crédito.',
  warningCardPurchaseStatus: (flag: string) =>
    `Compras no cartão não têm estado pendente ou confirmado: a compra vai para a fatura não conciliada. ${flag} foi ignorado.`,
  warningScheduledAlias: () =>
    '--scheduled agora é --pending: ambos deixam Confirmado desligado; a API mostra o lançamento como agendado quando a data está no futuro e como pendente caso contrário.',
  intervalDaily: () => 'diária',
  intervalWeekly: () => 'semanal',
  intervalMonthly: () => 'mensal',
  intervalYearly: () => 'anual',
  scheduleEvery: (interval: string, frequency: number) => `${interval}, a cada ${frequency}`,
  scheduleInfinite: () => 'infinitas vezes',
  scheduleTimes: (times: number) => `${times} vezes`,
  scheduleStartingAtInstallment: (installment: number) => `, começando na parcela ${installment}`,
  entryCreated: () => 'Lançamento criado com sucesso!',
  labelInstallments: () => 'Parcelas',
  labelRecurrence: () => 'Recorrência',
  errorInvalidRepeatInterval: (repeat: string) =>
    `Intervalo de repetição inválido: ${repeat}. Válidos: daily, weekly, monthly, yearly (ou d, w, m, y)`,
  errorInvalidCount: (flag: string, value: string, min: number) =>
    `${flag} inválido: ${value}. Use um número inteiro de pelo menos ${min}.`,
  errorFirstInstallmentNeedsInstallments: () =>
    '--first-installment e --per-installment só se aplicam com --installments <n>.',
  errorFrequencyNeedsRepeat: () =>
    '--frequency e --times precisam de --repeat <intervalo> (ou --installments <n>).',
  errorTimesWithInstallments: () =>
    '--times é para séries fixas; --installments <n> já define quantas parcelas existem.',
  errorFirstInstallmentPastLast: (installment: number, total: number) =>
    `--first-installment ${installment} passa da última parcela (${total}).`,
  errorUnknownCategoryForEntry: (input: string) =>
    `Categoria desconhecida: ${input}. Veja as categorias disponíveis com: mdcli categories list --active`,
  errorCategoryInactive: (name: string, id: number) =>
    `A categoria "${name}" (${id}) está inativa, então o app web a esconde de novos lançamentos. ` +
    'Use uma categoria ativa (veja: mdcli categories list --active) ou reative-a no Meu Dinheiro.',
  errorCategoryEntryTypeMismatch: (
    name: string,
    id: number,
    categoryType: string,
    entryType: string
  ) =>
    `A categoria "${name}" (${id}) é ${categoryType}, mas o tipo do lançamento é ${entryType}. ` +
    'O app web só oferece categorias que correspondem ao tipo do lançamento: use -c com uma categoria desse tipo ' +
    '(veja: mdcli categories list --active), ou mude -T.',
  categoryTypeExpense: () => 'uma despesa',
  categoryTypeIncome: () => 'receita',
  categoryTypeTransfer: () => 'uma transferência',
  errorTransferSameAccount: () =>
    'Uma transferência precisa de duas contas diferentes: --to-account aponta para a mesma conta que --account.',
  errorTransferCreditCard: () =>
    'Transferências de ou para uma conta de cartão de crédito ainda não são suportadas pela CLI. Use o app web.',
  errorTransferDifferentCurrencies: () =>
    'Transferências entre contas em moedas diferentes ainda não são suportadas pela CLI. Use o app web.',
  errorNoTransferCategory: () =>
    'Nenhuma categoria de transferência encontrada. Informe uma com -c, --category <id|alias>. Veja: mdcli categories list',
  errorInvoicePaymentTypeChange: () =>
    'Um pagamento de fatura não pode ser transformado em despesa, receita ou transferência. Altere no app web.',
  errorInvoicePaymentCategory: (id: number) =>
    `O pagamento de fatura ${id} precisa de uma categoria de transferência. Altere no app web.`,
  errorEntryNotTransfer: (id: number) =>
    `O lançamento ${id} não é uma transferência. Uma transferência precisa de duas contas e é salva como um par, então um lançamento não pode se tornar uma: ` +
    'exclua-o e crie a transferência com: mdcli entries create -T transfer --to-account <id>.',
  errorCategoryOnlyTransfers: (name: string, id: number, entryId: number) =>
    `A categoria "${name}" (${id}) só classifica transferências, e o lançamento ${entryId} não é uma transferência. ` +
    "Use -c com uma categoria do tipo do lançamento (veja: mdcli categories list --active).",
  entryUpdated: () => 'Lançamento atualizado com sucesso!',
  errorOnlyOneStatus: () => 'Use apenas uma das opções --pending, --confirmed e --reconciled.',
  errorNoEntryChanges: () =>
    'Nenhuma alteração informada. Use opções como --description, --value, --date, etc.',
  errorClosedInvoiceAccount: (id: number) =>
    `O lançamento ${id} está numa fatura fechada, então sua conta não pode ser alterada (o app web também bloqueia).`,
  errorInvoicePaymentAccounts: (id: number) =>
    `O lançamento ${id} é um pagamento de fatura, e um pagamento de fatura envolve um cartão de crédito: altere as contas no app web.`,
  errorToAccountOnlyTransfersUpdate: () =>
    '--to-account só se aplica a transferências. Use --account para mover o lançamento para outra conta.',
  warningSeriesThisOnlyUpdate: (id: number, repetition: string) =>
    `O lançamento ${id} é uma ocorrência de uma série recorrente (${repetition}): apenas esta ocorrência será alterada, e ela sairá da série. Use --scope following para alterar esta e as seguintes, ou --scope this para silenciar este aviso.`,
  errorDetachedSeriesUpdate: (id: number, repetition: string) =>
    `O lançamento ${id} pertence a uma série recorrente (${repetition}), mas o servidor não o vincula mais à série (como a primeira ocorrência, ou uma já confirmada ou conciliada), então ele muda sozinho. Para alterar a série, use --scope following numa ocorrência agendada.`,
  errorTransferToOrdinary: () =>
    'Uma transferência não pode se tornar uma despesa ou uma receita. Exclua-a e crie o lançamento que deseja.',
  errorAccountInactive: (name: string, id: number) =>
    `A conta "${name}" (${id}) está inativa, então o app web não a oferece. ` +
    'Use uma conta ativa (veja: mdcli accounts list --active) ou reative-a no Meu Dinheiro.',
  errorTransferSameAccounts: (id: number) =>
    `Uma transferência precisa de duas contas diferentes: origem e destino seriam a conta ${id}.`,
  errorReconcileCardPurchase: () =>
    'A CLI não concilia compras no cartão: remova -r/--reconciled para mover o lançamento para um cartão de crédito.',
  warningCardPurchaseMoveStatus: (state: string, flag: string) =>
    `Compras no cartão não têm estado pendente ou confirmado: a compra vai para a fatura ${state}. ${flag} foi ignorado.`,
  cardPurchaseReconciledState: () => 'conciliada, como estava',
  cardPurchaseUnreconciledState: () => 'não conciliada',
  errorTransferSingleAccount: (id: number) =>
    `O lançamento ${id} é uma transferência mas nomeia apenas uma conta. Ele não pode ser atualizado pela CLI.`,
  warningSeriesThisOnlyDelete: (id: number, repetition: string) =>
    `O lançamento ${id} é uma ocorrência de uma série recorrente (${repetition}): apenas esta ocorrência será excluída. Use --scope following para excluir esta e as seguintes, ou --scope this para silenciar este aviso.`,
  errorDetachedSeriesDelete: (id: number, repetition: string) =>
    `O lançamento ${id} pertence a uma série recorrente (${repetition}), mas o servidor não o vincula mais à série (como a primeira ocorrência, ou uma já confirmada ou conciliada), então ele é excluído sozinho. Para excluir a série, use --scope following numa ocorrência agendada.`,
  entriesDeleteHeader: () => 'Lançamento a ser excluído:',
  confirmDeleteSeriesEntry: () =>
    'Tem certeza de que deseja excluir esta ocorrência e todas as seguintes? (y/N) ',
  confirmDeleteEntry: () => 'Tem certeza de que deseja excluir este lançamento? (y/N) ',
  entryDeleted: (id: number) => `Lançamento ${id} excluído com sucesso!`,
  entryAndFollowingDeleted: (id: number) =>
    `Lançamento ${id} e as ocorrências seguintes excluídos com sucesso!`,
};
