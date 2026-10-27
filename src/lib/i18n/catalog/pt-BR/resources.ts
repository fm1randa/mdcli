/** Categories, tags, cards, sync and aliases, in Brazilian Portuguese. */

export const ptBRResources = {
  // --- Categories ----------------------------------------------------------------
  categoriesManageDescription: () => 'Gerenciar as categorias',
  categoriesListDescription: () => 'Listar todas as categorias',
  categoriesListTypeOption: () => 'Mostrar apenas um tipo: expense, income ou transfer',
  categoriesActiveOnlyOption: () => 'Mostrar apenas as ativas',
  categoriesHeader: (count: number) => `Categorias (${count})`,
  categoriesCreateDescription: () => 'Criar uma categoria ou, com --parent, uma subcategoria',
  categoriesCreateNameOption: () => 'Nome da categoria',
  categoriesCreateTypeOption: () => 'expense ou income (herdado de --parent quando omitido)',
  categoriesCreateParentOption: () => 'Categoria pai (ID, alias ou nome)',
  categoriesUpdateDescription: () => 'Atualizar uma categoria (só os campos informados são alterados)',
  categoriesUpdateNameOption: () => 'Novo nome da categoria',
  categoriesUpdateActiveOption: () => 'Marcar a categoria como ativa',
  categoriesUpdateInactiveOption: () => 'Marcar a categoria como inativa (arquivar)',
  categoriesDeleteDescription: () => 'Excluir uma categoria, movendo os lançamentos para outra',
  categoriesDeleteMoveToOption: () => 'Categoria (ID, alias ou nome) que recebe os lançamentos',
  categoryCreated: (name: string) => `Categoria "${name}" criada com sucesso!`,
  categoryUpdated: (name: string) => `Categoria "${name}" atualizada com sucesso!`,
  categoryDeleted: (id: string | number, destination: string) =>
    `Categoria ${id} excluída; seus lançamentos agora pertencem a "${destination}".`,
  errorInvalidCategoryId: () => 'ID da categoria inválido. Deve ser um número.',
  errorCategoryNotFound: (input: string) => `Categoria "${input}" não encontrada. Veja: mdcli categories list`,
  errorCategoryIdNotFound: (id: number) => `Categoria ${id} não encontrada.`,
  errorInvalidCategoryType: (value: string) => `Tipo inválido "${value}". Use expense, income ou transfer.`,
  errorInvalidCategoryTypeParent: (value: string) => `Tipo inválido "${value}". Use expense ou income.`,
  errorCategoryTypeRequired: () =>
    'Use --type (expense ou income) para uma categoria de nível superior, ou --parent para uma subcategoria.',
  errorTransferCategorySubcategory: () => 'Categorias de transferência não podem ter subcategorias.',
  errorCategoryTypeMismatch: () => '--type não corresponde ao tipo da categoria pai.',
  errorCategoryTypeUndetermined: () => 'Não foi possível determinar o tipo da categoria.',
  errorCategoryNoChanges: () => 'Nenhuma alteração informada. Use --name, --active ou --inactive.',
  errorCategorySystemEdit: (name: string) => `A categoria "${name}" não pode ser editada (categoria do sistema).`,
  errorCategorySystemDelete: (name: string) => `A categoria "${name}" não pode ser excluída (categoria do sistema).`,
  errorCategoryHasChildren: (name: string) =>
    `A categoria "${name}" tem subcategorias. Exclua ou mova-as primeiro.`,
  errorMoveToSameCategory: () => '--move-to deve ser uma categoria diferente.',
  errorMoveToSameType: (name: string) => `--move-to deve ser do mesmo tipo de "${name}".`,
  confirmDeleteCategory: (name: string, id: string | number, destination: string) =>
    `Excluir a categoria "${name}" (${id}) e mover seus lançamentos para "${destination}"? (y/N) `,

  // --- Tags ----------------------------------------------------------------------
  tagsManageDescription: () => 'Gerenciar as tags',
  tagsListDescription: () => 'Listar todas as tags',
  tagsActiveOnlyOption: () => 'Mostrar apenas as ativas',
  tagsHeader: (count: number) => `Tags (${count})`,
  tagsCreateDescription: () => 'Criar uma nova tag',
  tagsCreateNameOption: () => 'Nome da tag',
  tagsCreateColorOption: () => 'Cor da tag em hexadecimal (ex.: #FF0000); padrão: cinza',
  tagsUpdateDescription: () => 'Atualizar uma tag (só os campos informados são alterados)',
  tagsUpdateNameOption: () => 'Novo nome da tag',
  tagsUpdateColorOption: () => 'Nova cor da tag em hexadecimal (ex.: #FF0000)',
  tagsUpdateActiveOption: () => 'Marcar a tag como ativa',
  tagsUpdateInactiveOption: () => 'Marcar a tag como inativa (arquivar)',
  tagsDeleteDescription: () => 'Excluir uma tag',
  tagCreated: (name: string) => `Tag "${name}" criada com sucesso!`,
  tagUpdated: (name: string) => `Tag "${name}" atualizada com sucesso!`,
  tagDeleted: (id: string | number) => `Tag ${id} excluída com sucesso!`,
  errorInvalidTagId: () => 'ID da tag inválido. Deve ser um número.',
  errorTagNotFound: (id: number) => `Tag ${id} não encontrada.`,
  errorTagNoChanges: () => 'Nenhuma alteração informada. Use --name, --color, --active ou --inactive.',
  errorInvalidColor: () => 'Cor inválida. Use um código hexadecimal de 6 dígitos, ex.: #FF0000.',
  confirmDeleteTag: (name: string, id: string | number) =>
    `Tem certeza de que deseja excluir a tag "${name}" (${id})? (y/N) `,

  // --- Cards ---------------------------------------------------------------------
  cardsManageDescription: () => 'Gerenciar os cartões de crédito',
  cardsListDescription: () => 'Listar todos os cartões de crédito',
  cardsActiveOnlyOption: () => 'Mostrar apenas os cartões ativos',
  cardsNextDue: () => 'Próximo vencimento',
  cardsHeader: (count: number) => `Cartões de Crédito (${count})`,
  cardsInvoiceDescription: () => 'Mostrar os lançamentos da fatura do cartão de crédito',
  cardsAccountOption: () => 'ID do cartão, alias ou nome exato (sem diferenciar maiúsculas/minúsculas)',
  cardsInvoiceMonthOption: () =>
    'Mês da fatura, com vencimento no dia de vencimento do cartão (padrão: fatura atual/próxima)',
  cardsInvoiceJsonOption: () => 'Saída em JSON (uma lista de itens)',
  cardsInvoiceSummaryOption: () =>
    'Apenas o resumo da fatura; com --json, imprime { invoice, entries } em vez da lista',
  cardsFutureDescription: () => 'Mostrar as parcelas futuras do cartão de crédito',
  cardsInvoiceHeader: (name: string, dueDate: string, count: number, total: string) =>
    `Fatura de ${name} - ${dueDate} (${count} lançamentos) | Total: ${total}`,
  cardsFutureHeader: (name: string, count: number, total: string) =>
    `Parcelas Futuras de ${name} (${count} itens) | Total: ${total}`,
  errorAccountNotFoundById: (id: number) => `Conta não encontrada: ${id}`,
  errorNotCreditCard: (id: number) => `A conta ${id} não é um cartão de crédito`,

  // --- Sync ----------------------------------------------------------------------
  syncManageDescription: () => 'Listar as conexões e solicitar uma sincronização',
  syncListDescription: () => 'Listar as conexões e as contas vinculadas a cada uma',
  syncRunDescription: () =>
    'Solicitar uma sincronização para a conexão que contém uma conta, ou para todas as conexões',
  syncRunAccountArgument: () => 'Identificador da conta (id, alias ou nome exato), ou "all"',
  syncRunYesOption: () => 'Pular a confirmação',
  syncRunJsonOption: () => 'Saída em JSON (requer --yes)',
  syncConnectionColumn: () => 'Conexão',
  syncConnectionAccountColumn: () => 'Conta da conexão',
  syncNoAccount: () => 'Sem conta',
  syncConnectionsHeader: (count: number) => `Conexões (${count})`,
  syncConfirmationOne: (id: number) =>
    `Solicitar uma sincronização para a conexão ${id}? Cada conector aceita no máximo 3 sincronizações por dia. (y/N) `,
  syncConfirmationMany: (ids: string) =>
    `Solicitar uma sincronização para as conexões ${ids}? Cada conector aceita no máximo 3 sincronizações por dia. (y/N) `,
  errorSyncRequiresYes: () => 'sync run --json requer --yes',
  syncNoConnections: () => 'Nenhuma conexão para sincronizar.',
  syncCancelled: () => 'Sincronização cancelada.',
  syncNone: () => 'nenhuma',
  syncAlreadyUpdated: (reason: string, done: string) => `${reason} Já atualizadas: ${done}.`,
  syncUpdatingOne: (id: string) =>
    `A conexão ${id} está UPDATING. Execute sync list novamente para ver o resultado.`,
  syncUpdatingMany: (ids: string) =>
    `As conexões ${ids} estão UPDATING. Execute sync list novamente para ver o resultado.`,
  errorConnectionsPayload: () => 'GET /v1/integracao/connections não retornou uma lista de conexões',
  errorConnectionMissingId: (id: number) =>
    `A conta ${id} está vinculada a uma conexão que não incluiu o ID dela.`,
  errorAccountWithoutConnection: (id: number) => `A conta ${id} não está vinculada a nenhuma conexão.`,
  errorAccountMultipleConnections: (id: number, connections: string) =>
    `A conta ${id} está vinculada a mais de uma conexão (${connections}).`,
  errorAccountLinkedTwice: (id: number, connectionId: number, accounts: string) =>
    `A conta ${id} está vinculada duas vezes na conexão ${connectionId} (${accounts}).`,

  // --- Aliases -------------------------------------------------------------------
  aliasEntityAccount: () => 'conta',
  aliasEntityCategory: () => 'categoria',
  aliasEntityTag: () => 'tag',
  aliasManageDescription: (entity: string) => `Gerenciar os aliases de ${entity}`,
  aliasAddDescription: (entity: string) => `Adicionar um alias para uma ${entity}`,
  aliasListDescription: (entity: string) => `Listar todos os aliases de ${entity}`,
  aliasRemoveDescription: (entity: string) => `Remover um alias de ${entity}`,
  aliasUpdateDescription: (entity: string) => `Atualizar um alias de ${entity}`,
  aliasIdOption: (entity: string) => `ID da ${entity}`,
  aliasNameOption: () => 'Nome do alias',
  aliasNewNameOption: () => 'Novo nome do alias',
  aliasListHeader: (entity: string, count: number) => `Aliases de ${entity} (${count})`,
  aliasColumn: () => 'Alias',
  aliasNone: () => 'Nenhum alias definido',
  aliasAdded: (name: string, entity: string, id: number) =>
    `Alias "${name}" adicionado para a ${entity} ${id}`,
  aliasUpdated: (name: string, entity: string, id: number) =>
    `Alias atualizado para "${name}" na ${entity} ${id}`,
  aliasRemoved: () => 'Alias removido',
  errorInvalidAliasId: () => 'ID inválido. Deve ser um número.',
  errorAliasExists: (name: string) => `O alias "${name}" já existe`,
  errorAliasIdExists: (id: number, name: string) => `O ID ${id} já tem o alias "${name}"`,
  errorAliasNotFoundForId: (id: number) => `Nenhum alias encontrado para o ID ${id}`,
  errorAliasNotFound: (identifier: string) => `Nenhum alias encontrado para "${identifier}"`,
  errorAliasIdOrName: () => 'Use --id ou --name',
  errorAliasAddFailed: () => 'Falha ao adicionar o alias',
  errorAliasRemoveFailed: () => 'Falha ao remover o alias',
  errorAliasUpdateFailed: () => 'Falha ao atualizar o alias',
};
