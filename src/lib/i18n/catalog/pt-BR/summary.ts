import { groupNouns, summaryGroupingMessages } from '../../summary-grouping.js';

const grouping = summaryGroupingMessages(
  groupNouns(
    { column: 'Categoria', header: 'categoria' },
    { column: 'Mês', header: 'mês' },
    { column: 'Conta', header: 'conta' },
  ),
  (noun, from, to) => `Resumo por ${noun} | ${from} a ${to}`,
);

/** Entries summary and filter, in Brazilian Portuguese. */
export const ptBREntriesSummary = {
  entriesSummaryDescription: () =>
    'Total de receitas e despesas agrupado por categoria, mês ou conta',
  entriesSummaryByOption: () => 'Agrupar por: category, month ou account',
  entriesSummaryIncludeTransfersOption: () =>
    'Contar as transferências entre contas (deixadas de fora por padrão)',
  summaryGroupColumn: grouping.summaryGroupColumn,
  entriesSummaryHeader: grouping.entriesSummaryHeader,
  entriesExcludedByCategory: (count: number) =>
    `${count} lançamento${count === 1 ? '' : 's'} deixado${count === 1 ? '' : 's'} de fora por --exclude-category.`,
  entriesSkippedTransfers: (count: number) =>
    `${count} transferência${count === 1 ? '' : 's'} deixada${count === 1 ? '' : 's'} de fora. Use --include-transfers para contá-las.`,
  entriesSkippedPayments: (count: number) =>
    `${count} pagamento${count === 1 ? '' : 's'} de cartão deixado${count === 1 ? '' : 's'} de fora do resumo.`,
  entriesSkippedInvoices: (count: number) =>
    `${count} projeç${count === 1 ? 'ão' : 'ões'} de fatura deixada${count === 1 ? '' : 's'} de fora do resumo.`,
};
