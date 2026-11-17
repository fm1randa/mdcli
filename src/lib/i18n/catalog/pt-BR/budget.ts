/** Budget goals, in Brazilian Portuguese. The English catalog is typed by this one. */
export const ptBRBudget = {
  budgetDescription: () => 'Metas de orçamento do período: meta, realizado, falta e excedente',
  budgetMonthOption: () => 'Mês YYYY-MM (padrão: o mês atual). Não combina com --from/--to',
  budgetFromOption: () => 'Início YYYY-MM-DD. Sozinho, o fim é o último dia do mês atual',
  budgetToOption: () => 'Fim YYYY-MM-DD. Sozinho, o início é o primeiro dia do mês atual',
  budgetRegimeOption: () => 'cash (caixa, padrão) ou accrual (competência)',
  budgetRegimeCash: () => 'caixa',
  budgetRegimeAccrual: () => 'competência',
  budgetHeader: (from: string, to: string, regime: string) => `Orçamento ${from} → ${to} (${regime})`,
  budgetKindExpense: () => 'Despesas',
  budgetKindIncome: () => 'Receitas',
  budgetKindInvestment: () => 'Investimentos',
  budgetGeneral: () => 'Meta geral',
  budgetTotal: (kind: string) => `Total de ${kind}`,
  budgetGoal: () => 'Meta',
  budgetConfirmed: () => 'Confirmado',
  budgetProjected: () => 'Projetado',
  budgetRemaining: () => 'Falta',
  budgetSurplus: () => 'Excedente',
  budgetUnknownCategory: (id: number) => `Categoria ${id} (não encontrada)`,
  errorBudgetPeriodConflict: () => '--month não combina com --from ou --to.',
  errorInvalidBudgetMonth: (value: string) => `Mês inválido "${value}". Use YYYY-MM.`,
  errorBudgetRangeReversed: (from: string, to: string) => `--from ${from} é posterior a --to ${to}.`,
  errorInvalidRegime: (value: string) => `Regime inválido "${value}". Use cash ou accrual.`,
  budgetSetDescription: () => 'Define a meta de uma categoria para um mês, ou até outro mês',
  budgetRemoveDescription: () => 'Remove a meta de uma categoria (grava 0, e a leitura deixa de mostrá-la)',
  budgetSetCategoryOption: () => 'Categoria (id, apelido ou nome)',
  budgetRemoveCategoryOption: () => 'Categoria (id, apelido ou nome) cuja meta sai',
  budgetSetValueOption: () => 'Valor com o sinal da leitura: despesa negativa, receita positiva. 0 não vale; use budget remove',
  budgetSetMonthOption: () => 'Mês YYYY-MM (padrão: o mês atual)',
  budgetSetUntilOption: () => 'Repete a meta de --month até este YYYY-MM, inclusive',
  budgetDryRunOption: () => 'Mostra a gravação sem gravar. Só lê a API e não pede confirmação',
  errorBudgetZero: () => 'Meta 0 apaga a meta. Use: mdcli budget remove',
  errorBudgetUntilBefore: (until: string, month: string) => `--until ${until} é anterior a ${month}.`,
  errorBudgetSpanTooLong: () => 'Uma meta cobre no máximo 600 meses.',
  errorBudgetTransfer: (name: string) => `A categoria "${name}" é uma transferência. A meta vale para despesa ou receita.`,
  errorBudgetParentSum: (name: string, min: number, month: string) =>
    `A soma da categoria ${name} em ${month} deve ser maior ou igual à soma das filhas (mínimo ${min}).`,
  errorBudgetJsonNeedsSkip: () => '--json não pergunta. Use --dry-run ou --dangerously-skip-confirmation.',
  confirmBudgetSet: (name: string, id: number, amount: string, months: string) =>
    `Definir a meta de "${name}" (${id}) como ${amount} em ${months}? (y/N) `,
  confirmBudgetRemove: (name: string, id: number, months: string) =>
    `Remover a meta de "${name}" (${id}) em ${months}? (y/N) `,
  budgetWriteCancelled: () => 'Gravação cancelada.',
  budgetDryRunSet: (name: string, id: number, amount: string, months: string) =>
    `Gravaria a meta de "${name}" (${id}) como ${amount} em ${months}.`,
  budgetDryRunRemove: (name: string, id: number, months: string) =>
    `Removeria a meta de "${name}" (${id}) em ${months}.`,
  budgetSetDone: (name: string, id: number, amount: string, months: string) =>
    `Meta de "${name}" (${id}) definida como ${amount} em ${months}.`,
  budgetRemoveDone: (name: string, id: number, months: string) =>
    `Meta de "${name}" (${id}) removida em ${months}.`,
};
