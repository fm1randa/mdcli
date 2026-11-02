/** Entries update and delete, in Brazilian Portuguese. */
export const ptBREntriesUpdateDelete = {
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
};
