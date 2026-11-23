/** Entries create, in Brazilian Portuguese. */
export const ptBREntriesCreate = {
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
  entriesCreateSavingsGoalOption: () =>
    'Transferências: ID da meta de economia ativa a ligar (aporte quando a conta de destino é da meta, resgate quando é a de origem)',
  entriesCreateDryRunOption: () => 'Mostrar o payload sem gravar. Só lê a API',
  entriesCreateDryRunNote: () => 'Simulação: nada foi gravado.',
  errorSavingsGoalOnlyTransfers: () => '--savings-goal só se aplica a transferências (-T transfer --to-account).',
  errorInvalidSavingsGoal: (input: string) => `ID de meta de economia inválido: ${input}`,
  errorSavingsGoalNotFound: (id: number) => `Meta de economia ${id} não encontrada.`,
  errorSavingsGoalInactive: (id: number, name: string) => `A meta de economia ${id} (${name}) está inativa.`,
  errorSavingsGoalNoAccount: (id: number, name: string, origin: number, destination: number) =>
    `A meta de economia ${id} (${name}) não usa a conta ${origin} nem a conta ${destination}.`,
  errorSavingsGoalBothAccounts: (id: number, name: string) =>
    `A meta de economia ${id} (${name}) usa as duas contas da transferência: não dá para saber se é aporte ou resgate.`,
};
