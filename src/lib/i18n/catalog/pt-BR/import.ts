/** Import, in Brazilian Portuguese. */

export const ptBRImport = {
  // --- Import --------------------------------------------------------------------
  importCommandDescription: () => 'Listar e importar transações bancárias de uma conexão bancária',
  importListDescription: () => 'Listar as transações bancárias de uma conta',
  importAccountOption: () =>
    'ID da conta, alias ou nome exato (sem diferenciar maiúsculas/minúsculas)',
  importSinceHelp: () =>
    'Carregar o extrato completo a partir desta data (AAAA-MM-DD, no máximo 90 dias atrás), já importado ou não. ' +
    'Padrão: as novas transações bancárias que a conexão informa; sem elas, o extrato desde a última data de ' +
    'extrato da conta (ou 90 dias atrás, se for anterior), como o botão de importação do app web',
  importSearchFromHelp: () =>
    'Data mais antiga dos candidatos (AAAA-MM-DD). Padrão: dois dias antes do início do extrato',
  importSearchToHelp: () =>
    'Data mais recente dos candidatos (AAAA-MM-DD). Padrão: dois dias depois do fim do extrato',
  importNotes: () =>
    '\nSem --since, as novas transações bancárias que a conexão informa (o resumo dela, o selo de importação do app web)\n' +
    'são carregadas. Uma conexão lida sem uma sincronização raramente tem resumo; sem ele, o extrato é\n' +
    'carregado a partir da data padrão do diálogo de importação do app web: a última data de extrato da conta, ou 90 dias atrás\n' +
    'se for anterior ou estiver ausente. --since carrega o extrato a partir de outra data.\n' +
    '\nCada transação bancária é vinculada a no máximo um lançamento existente (conciliateWith), como o app web faz:\n' +
    'mesmo valor; primeiro um lançamento na data do banco, depois no dia anterior, no dia seguinte, 2 dias antes,\n' +
    '2 dias depois; primeiro o mesmo número de documento. Lançamentos conciliados não são listados como candidatos e são\n' +
    'vinculados apenas no mesmo dia, mas --plan ("entry") e --edit (conciliate <prefixo> <entryId>)\n' +
    'ainda podem nomear um. Num cartão de crédito, os candidatos são a fatura inteira da próxima data de vencimento\n' +
    '(proximoVencimento), sem janela de datas; um cartão sem ela não pode ser importado.\n' +
    '\nAs sugestões de IA vêm do servidor e podem variar entre execuções; fixe a categoria com\n' +
    '--category, --plan ou --edit.',
  importRunDescription: () =>
    'Importar as transações bancárias selecionadas de uma conta (pergunta y/N antes de gravar)',
  importIdsOption: () =>
    'Prefixos de integrationId separados por vírgula a importar com --category',
  importCategoryOption: () =>
    'ID da categoria, alias ou nome exato para cada item de --ids',
  importRejectOption: () =>
    'Prefixos de integrationId separados por vírgula para marcar como não importados',
  importPlanOption: () =>
    'Arquivo JSON com uma ação por transação bancária (import, conciliate, reject, skip)',
  importEditOption: () =>
    'Escolher a ação, a categoria e a descrição de cada transação bancária no $EDITOR',
  importIncludeDuplicatesOption: () =>
    'Importar duplicatas em vez de pulá-las (--ids; --edit as abre como import)',
  importDryRunOption: () => 'Mostrar o que seria importado sem gravar nada',
  importYesOption: () => 'Pular a confirmação',
  importJsonOption: () => 'Saída em JSON (requer --yes ou --dry-run)',
  errorConnectionMissingAccountId: (accountId: number, connectionId: number) =>
    `A conta ${accountId} está vinculada à conexão ${connectionId}, que não incluiu o ID da conta da conexão.`,
  errorCardSearchWindow: () =>
    'Uma janela de busca num cartão de crédito não é permitida. Os candidatos vêm da fatura atual do cartão.',
  errorSearchStartAfterEnd: (from: string, to: string) =>
    `O início da busca (${from}) é depois do fim da busca (${to}).`,
  importNothingNew: (since: string) => `Nenhuma transação bancária desde ${since}.`,
  importNothingNewHint: (floor: string) =>
    ` Para buscar mais para trás, use --since <AAAA-MM-DD> (${floor} ou depois).`,
  importCandidateLinked: (id: number) => `${id} (vinculado)`,
  importListSummaryHeader: (count: number, start: string, end: string) =>
    `Novas transações bancárias (${count}), extrato de ${start} a ${end}`,
  importListStatementHeader: (count: number, since: string) =>
    `Transações bancárias (${count}) desde ${since}`,
  warningAiUnavailable: () =>
    'As sugestões de categoria por IA estão indisponíveis. Apenas as regras aprendidas foram aplicadas.',
  errorCardNoDueDate: (id: number) =>
    `O cartão ${id} não tem próxima data de vencimento no Meu Dinheiro, então não há fatura atual onde encontrar lançamentos correspondentes. ` +
    'Defina o vencimento do cartão no app web (edite o cartão) e execute a importação novamente.',
  errorInvoiceNoLancamentos: (id: number, due: string) =>
    `GET /v1/cartoes/${id}/fatura/${due} não retornou lancamentos`,
  errorStatementDidNotReturnStatement: (origin: string) => `${origin} não retornou um extrato`,
  errorStatementDidNotReturnLancamentos: (origin: string) =>
    `${origin} não retornou lancamentos`,
  importEditCandidates: (prefix: string) => `# candidatos ${prefix}`,
  importEditLeftOut: (list: string) =>
    `# Deixados de fora (sem id, data ou valor do banco): ${list}`,
  importEditImportFor: (name: string, start: string, end: string) =>
    `# Importação para ${name}, extrato de ${start} a ${end}.`,
  importEditCommandsHeader: () => '# Comandos:',
  importEditImportCommand: () =>
    '#   import <prefixo> <data> <valor> <categoria> | <descrição>   criar um lançamento',
  importEditConciliateCommand: () =>
    '#   conciliate <prefixo> [<entryId>] <data> <valor> <categoria> | <descrição>   vincular a um lançamento existente',
  importEditReconciledNote: () =>
    '#     Lançamentos conciliados não são listados como candidatos, mas o id deles ainda pode ser escrito aqui.',
  importEditSkipCommand: () => '#   skip <prefixo> ...     deixar para depois',
  importEditRejectCommand: () => '#   reject <prefixo> ...   marcar como não importado',
  importEditDateValueNote: () =>
    '# A data e o valor absoluto devem ser os do banco; inverter o sinal é permitido.',
  importEditCommentsNote: () =>
    '# Linhas começando com # são comentários. Remova todas as linhas de comando para cancelar.',
  importEditExpectedLine: (where: string) =>
    `${where}: esperado "<comando> <prefixo> <data> <valor> <categoria> | <descrição>".`,
  importEditUnknownCommand: (where: string, command: string, actions: string) =>
    `${where}: comando desconhecido "${command}". Use ${actions}.`,
  importEditOnlyConciliateEntryId: (id: string) =>
    `${id}: só conciliate aceita um ID de lançamento.`,
  importEditDateMustBeBankDate: (id: string, date: string) =>
    `${id}: a data deve ser a do banco, ${date}.`,
  importEditValueNotNumber: (id: string, value: string) =>
    `${id}: o valor ${value} não é um número.`,
  importEditMoreThanOneLine: (id: string) => `${id}: tem mais de uma linha de comando.`,
  importEditLine: (line: number) => `Linha ${line}`,
  importEditPrefixFlag: (where: string) => `${where}: prefixo`,
  importPrefixNoMatch: (flag: string, prefix: string) =>
    `${flag} ${prefix} não corresponde a nenhuma transação bancária.`,
  importPrefixManyMatches: (flag: string, prefix: string, count: number) =>
    `${flag} ${prefix} corresponde a ${count} transações bancárias. Use um prefixo mais longo.`,
  errorEditorRequired: () =>
    '--edit precisa de $EDITOR (ex.: EDITOR=vim). Nada foi gravado.',
  errorEditUnchangedInvalid: (errors: string) =>
    `O arquivo não foi alterado e continua inválido. Nada foi gravado.\n${errors}`,
  errorCouldNotRunEditor: (editor: string, message: string) =>
    `Não foi possível executar $EDITOR (${editor}): ${message}. Nada foi gravado.`,
  errorEditorStopped: (editor: string, how: string) =>
    `$EDITOR (${editor}) ${how}. Nada foi gravado.`,
  editorStoppedBySignal: (signal: string) => `foi interrompido por ${signal}`,
  editorExitedWithCode: (status: number) => `saiu com o código ${status}`,
  errorCannotReadPlanFile: (path: string, message: string) =>
    `Não foi possível ler o arquivo --plan ${path}: ${message}`,
  errorPlanInvalidJson: (message: string) =>
    `O arquivo --plan não é um JSON válido: ${message}`,
  errorPlanNotObject: () => 'o arquivo deve ser um objeto JSON com "transactions".',
  errorPlanUnknownKey: (key: string) =>
    `chave desconhecida ${key} (o arquivo só tem "transactions").`,
  errorPlanTransactionsMustBeList: () => '"transactions" deve ser uma lista.',
  errorPlanEmpty: () => '"transactions" está vazio. Não existe "importar tudo".',
  errorPlanIdMustBeString: () => '"id" deve ser um prefixo ou uma string UUID.',
  errorPlanActionOneOf: (actions: string) => `"action" deve ser uma de ${actions}.`,
  errorPlanKeyNotApplicable: (key: string, action: string) =>
    `${key} não se aplica a ${action}.`,
  errorPlanCategory: () =>
    '"category" deve ser um ID de categoria, alias ou nome.',
  errorPlanValue: () => '"value" deve ser um número.',
  errorPlanDescription: () => '"description" deve ser uma string.',
  errorPlanEntry: () => '"entry" deve ser um ID de lançamento numérico.',
  errorPlanCategoryRequired: () => '"category" é obrigatório para import.',
  errorInvalidPlanFile: (problems: string) =>
    `Arquivo --plan inválido. Nada foi importado.\n${problems}`,
  errorNothingImported: (problems: string) =>
    `Nada foi importado. Corrija a seleção:\n${problems}`,
  importNoBankDate: () => 'o banco não enviou uma data.',
  importZeroValue: () => 'o valor é zero.',
  errorWrittenValue: (value: number, bankValue: number) =>
    `o valor ${value} não é o valor do banco (${bankValue}). Só o sinal pode mudar.`,
  importNoCategory: () => 'está sem categoria.',
  importNoBankValue: () => 'o banco não enviou um valor.',
  errorCategoryExpenseNegative: (name: string) =>
    `a categoria "${name}" é uma despesa, então o valor deve ser negativo.`,
  errorCategoryIncomePositive: (name: string) =>
    `a categoria "${name}" é uma receita, então o valor deve ser positivo.`,
  errorCategoryIsTransfer: (name: string) => `a categoria "${name}" é uma transferência.`,
  importDryRunHeader: (name: string, connectionAccount: number) =>
    `Simulação de importação para ${name} (conta da conexão ${connectionAccount})`,
  importRunHeader: (name: string, connectionAccount: number) =>
    `Importação para ${name} (conta da conexão ${connectionAccount})`,
  importStatementSummary: (start: string, end: string, balance: string) =>
    `Extrato de ${start} a ${end}, saldo ${balance}`,
  importCounts: (imported: number, conciliated: number, rejected: number, skipped: number) =>
    `Importar ${imported}, conciliar ${conciliated}, rejeitar ${rejected}, pular ${skipped}.`,
  importNewEntriesHeader: () => 'Novos lançamentos',
  importLinkedEntriesHeader: () => 'Lançamentos vinculados',
  importRejectedHeader: () => 'Rejeitados',
  importSkippedHeader: () => 'Pulados',
  importSkipReasonDuplicate: () => 'duplicado',
  importSkipReasonPlan: () => 'planejado',
  importDryRunNote: () => 'Simulação: nada foi gravado.',
  importReconciledKeepsFields: (prefix: string, entryId: number) =>
    `${prefix} (lançamento ${entryId}) já está conciliado: ` +
    'o app web só sobrescreve lançamentos não conciliados, então ele mantém seus campos.',
  importOverwrittenHeader: () => 'Sobrescritos pelo banco',
  importOverwriteUnavailable: () =>
    'As preferências de sobrescrita não puderam ser lidas, então vale o padrão do app web: os lançamentos vinculados mantêm seus campos.',
  importOverwriteOn: (fields: string) =>
    `Sobrescrita ligada (sua preferência no app web): os lançamentos vinculados que não estão conciliados recebem ${fields} da transação bancária.`,
  importOverwriteOff: (fields: string) =>
    `Sobrescrita desligada (sua preferência no app web): os lançamentos vinculados mantêm ${fields}; ` +
    'com ela ligada, os que não estão conciliados receberiam os da transação bancária.',
  importOverwriteFields: () =>
    'contato, categoria, centro de custo, projeto, tags e número do documento',
  importFillDescriptionOn: () =>
    'Preencher descrições vazias ligado (sua preferência no app web): um lançamento vinculado sem descrição recebe a da transação bancária.',
  importFillDescriptionOff: () =>
    'Preencher descrições vazias desligado (sua preferência no app web): os lançamentos vinculados mantêm sua descrição.',
  errorImportJsonRequires: () => 'entries import run --json requer --yes ou --dry-run',
  importNothingToDo: () =>
    'Nada a fazer: o arquivo não tem linhas de comando. Nada foi gravado.',
  importNothingNewWritten: (message: string) => `${message} Nada foi gravado.`,
  confirmImport: () => 'Gravar esta importação no Meu Dinheiro? (y/N) ',
  importCancelled: () => 'Importação cancelada. Nada foi gravado.',
  importWritten: (name: string) => `Importação gravada para ${name}.`,
  errorPlanDoesNotCombineWithEdit: () => '--plan não se combina com --edit.',
  errorFlagDoesNotCombine: (flag: string, source: string) =>
    `${flag} não se combina com ${source}. Todas as escolhas vão no arquivo ${source}.`,
  errorCategoryOnlyIds: () => '--category só se aplica a --ids.',
  errorIdsNeedsCategory: () =>
    '--ids precisa de -c, --category: todo lançamento que a importação cria tem uma categoria.',
  errorNothingSelected: (listCommand: string) =>
    'Nada selecionado. Use --ids com --category, --reject, --plan ou --edit. Não existe "importar tudo". ' +
    `Para ver o que seria importado, com as categorias e ações sugeridas, use: ${listCommand}`,
  errorPrefixInBoth: (prefix: string) => `${prefix} está em --ids e em --reject.`,
  errorSelectedByBoth: (prefix: string) =>
    `${prefix} foi selecionado por --ids e por --reject.`,
  errorPrefixNeedsOne: (flag: string) => `${flag} precisa de pelo menos um prefixo.`,
  errorEntryIdNotEntry: (input: number | string) =>
    `o lançamento ${input} não é um ID de lançamento (um número inteiro de 1 a ${Number.MAX_SAFE_INTEGER}).`,
  errorImportTransferCategory: (name: string, id: number) =>
    `A categoria "${name}" (${id}) é uma categoria de transferência. A importação não cria transferências.`,
  errorSelectedTwice: (label: string, first: string, second: string) =>
    `${label}: selecionado duas vezes (${first} e ${second}).`,
  errorEntryAlreadyRecords: (id: number) =>
    `o lançamento ${id} já o registra (vinculado automaticamente). Use conciliate, ou pule-o.`,
  errorEntryNotCandidate: (entryId: number, known: string) =>
    `o lançamento ${entryId} não é candidato (${known}).`,
  importNoCandidates: () => 'ele não tem candidatos',
  importCandidatesList: (ids: string) => `candidatos: ${ids}`,
  errorNoEntryMatches: () =>
    'nenhum lançamento corresponde, então não há o que vincular.',
  errorEntriesMayMatch: (count: number, ids: string, hint: string) =>
    `${count} lançamento${count === 1 ? '' : 's'} pode${count === 1 ? '' : 'm'} corresponder (${ids}), nenhum vinculado automaticamente. ${hint}`,
  importEntryHintEdit: (prefix: string) =>
    `Escreva o que vincular: conciliate ${prefix} <entryId> ...`,
  importEntryHintPlan: () => 'Diga qual com "entry".',
  errorEarliestStart: (floor: string) =>
    `A data inicial mais antiga é ${floor}. Transações bancárias só podem ser carregadas dos últimos 90 dias.`,
  errorLatestStart: (day: string) => `A data inicial mais recente é hoje (${day}).`,
  errorMarkImportedFailed: (message: string) => `markImported falhou: ${message}`,
  errorPagesWritten: (message: string, index: number, total: number) =>
    `${message} Páginas gravadas antes da falha: ${index} de ${total}.`,
  errorBankTransactionNoDate: (id: string) => `A transação bancária ${id} não tem data.`,
};
