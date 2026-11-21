/** Entry labels and messages of the entry commands, in Brazilian Portuguese. */
export const ptBREntryLabels = {
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
