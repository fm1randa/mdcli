/** Entries summary and filter, in Brazilian Portuguese. */
export const ptBREntriesSummary = {
  entriesSummaryDescription: () =>
    'Total de receitas e despesas agrupado por categoria, mês ou conta',
  entriesSummaryByOption: () => 'Agrupar por: category, month ou account',
  entriesSummaryIncludeTransfersOption: () =>
    'Contar as transferências entre contas (deixadas de fora por padrão)',
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
};
