import type { EntriesPage } from './api-routes.js';
import type { Account, AccountsResponse, CardInvoiceResponse, CategoriesResponse, FirstInvoiceResponse, Category, EntriesResponse, Entry, SavingsGoal, TagsResponse } from '../src/types/index.js';

const editable = { visivel: true, acoes: { editar: true, excluir: true } };
const locked = { visivel: true, acoes: { editar: false, excluir: false } };

export const CHECKING_ACCOUNT: Account = {
  id: 201,
  nome: 'Conta Teste',
  tipo: 'CONTA CORRENTE',
  tipoNovo: 100,
  classificacaobp: 'ativo',
  status: true,
  encerrada: false,
  banco: { id: 'teste', nome: 'Banco Teste', img: 'teste', tipo: ['CONTA CORRENTE'] },
  exibirBP: true,
  apenasTransferencia: false,
  dataUltimoExtrato: '2026-01-10',
  saldoUltimoExtrato: 250.5,
  liquidez: 1,
  saldoInicial: 0,
  moeda: 1,
  dataSaldoInicial: '2025-01-01',
  considerarCarteiraInvestimentos: 1,
  permissoes: editable,
  criptoGcap: 1,
};

export const CREDIT_CARD_ACCOUNT: Account = {
  ...CHECKING_ACCOUNT,
  id: 202,
  nome: 'Cartão Teste',
  tipo: 'CARTAOCREDITO',
  tipoNovo: 102,
  banco: undefined,
  proximoVencimento: '2026-01-16T00:00:00',
  proximoFechamento: '2026-01-08T00:00:00',
};

export const SAVINGS_ACCOUNT: Account = {
  ...CHECKING_ACCOUNT,
  id: 204,
  nome: 'Poupança Teste',
  tipo: 'POUPANCA',
  tipoNovo: 122,
  saldoUltimoExtrato: 0,
};

export const ACCOUNTS_RESPONSE: AccountsResponse = {
  meta: {
    tipos: [
      { id: 100, nome: 'Conta Corrente', liquidez: 1, basico: true },
      { id: 102, nome: 'Cartão de Crédito', grupobp: 50 },
      { id: 122, nome: 'Poupança', invest: true, liquidez: 2 },
    ],
    gruposbp: [],
    finalidades: [],
  },
  items: [CHECKING_ACCOUNT, CREDIT_CARD_ACCOUNT],
};

export function category(id: number, nome: string, tipo: 'd' | 'r' | 't', extra: Record<string, unknown> = {}): Category {
  const nomeRel = nome.split('/').at(-1) ?? nome;
  return {
    id,
    nome,
    nomeRel,
    tipo,
    status: true,
    permissoes: editable,
    _ordenacao: nome.toUpperCase(),
    sistema: false,
    ...extra,
  };
}

export const CATEGORIES_RESPONSE: CategoriesResponse = {
  meta: { dfc: [], dre: [] },
  items: [
    category(10, 'Alimentação', 'd'),
    category(11, 'Alimentação/Mercado', 'd', { pai: 10 }),
    category(20, 'Salário', 'r'),
    category(30, 'Transferência', 't', { sistema: true, permissoes: locked, tipoL: 15 }),
    category(40, 'Outros', 'd'),
  ],
};

export const EMPTY_ENTRIES_RESPONSE: EntriesResponse = { list: [], meta: { total: 0, page: 1, pageSize: 200 } };

/** GET /v1/frontend/sessao, trimmed to what the CLI reads (2026-10-26). The
 * CLI reads it as unknown (WebConfig), so there is no src/types response type:
 * the fixture owns this envelope. */
export interface SessionResponse {
  branch: string;
  payload: {
    ngInit: {
      mdUid?: string;
      usuario: {
        conta?: { config?: { pendentesPresente?: boolean; metasRD?: boolean; moeda?: number; visaoCompetencia?: boolean } };
        config?: { mdweb?: { moeda?: { m?: number }; [key: string]: unknown } };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
  };
}

export const SESSION_RESPONSE: SessionResponse = {
  branch: 'app',
  payload: {
    ngInit: {
      mdUid: '42',
      usuario: {
        conta: { config: { pendentesPresente: true, metasRD: false, moeda: 1 } },
        config: { mdweb: { moeda: { m: 1 } } },
      },
    },
  },
};

function entry(id: number, conta: number, categoria: number | undefined, tipo: 'd' | 'r' | 't', valor: number, data: string, descricao = `Entry ${id}`): Entry {
  return { id, descricao, conta, categoria, tipo, valor, data, dataPrevista: data, status: 'conciliado' };
}

export const SAMPLE_ENTRIES: Entry[] = [
  entry(1, 201, 11, 'd', -100.5, '2026-01-05', 'Mercado'),
  entry(2, 201, 11, 'd', -50.25, '2026-02-10', 'Mercado'),
  entry(3, 201, 20, 'r', 5000, '2026-01-01', 'Salário'),
  entry(4, 202, 10, 'd', -200, '2026-01-20', 'Restaurante'),
  entry(5, 201, 30, 't', -1000, '2026-01-15', 'Transferência para poupança'),
  entry(6, 201, undefined, 'd', -10, '2026-02-01', 'Café, "especial"'),
];

export function entriesPage(list: EntriesPage['list'], total = list.length): EntriesPage {
  return { list, meta: { total, page: 1, pageSize: 200 } };
}

/** Card invoice as GET /v1/cartoes/:id/fatura/:dueDate returns it.
 * `valor` / `resumo.totalFatura` are the bill total (purchases only); a
 * payment (tipo p) may still appear in lancamentos without changing them. */
export function cardInvoice(vencimento: string, fechamento: string, totalFatura = 0): CardInvoiceResponse {
  return {
    lancamentos: [],
    vencimento,
    fechamento,
    valor: totalFatura,
    resumo: { totalFatura, totalPagar: totalFatura },
  };
}

/** The card's first invoice as GET /v1/cartoes/:id/primeiraFatura returns it:
 * an object (real use 2026-11-09), not a date string. Synthetic values. */
export function firstInvoice(conta: number, vencimento: string, fechamento: string): FirstInvoiceResponse {
  return {
    vencimento,
    fechamento,
    valor: 0,
    conta,
    pagamentos: 0,
    pagamentosAgendados: 0,
    conciliado: 0,
    nconciliado: 0,
    id: 1,
  };
}

export const TAG_WORK: TagsResponse[number] = { id: 501, nome: 'Trabalho', status: true, cor: 'FF0000' };
export const TAG_PERSONAL: TagsResponse[number] = { id: 502, nome: 'Pessoal', status: false, cor: '00FF00' };

export const TAGS_RESPONSE: TagsResponse = [TAG_WORK, TAG_PERSONAL];

/**
 * GET /v1/metas/economia (#340, #339), read with "today" pinned to
 * GOALS_TODAY in test/goals-fixtures.ts. 8 is active on the savings account
 * (the one the seeded deposit and withdrawal link) with no contribution month
 * left (deadline 2026-06, latest movement 2026-05); 7 is active with 12 months
 * left; 9 and 10 are inactive; 11 is active on both test accounts.
 */
export const SAVINGS_GOALS: SavingsGoal[] = [
  {
    id: 7, descricao: 'Viagem Teste', status: true, valor: 12000, data: '2027-12-01', taxa: 0.005, saldo: 3000,
    contas: [{ conta: 204, saldo: 1500, saldoInicial: 1000 }, { conta: 201, saldo: 500, saldoInicial: 0 }],
    saldoInicial: 1000, dataSaldoInicial: '2026-01-10', dataSaldo: '2026-11-05',
  },
  {
    id: 8, descricao: 'Meta Teste', status: true, valor: 5000, data: '2026-06-01', taxa: 0, saldo: 4200,
    contas: [{ conta: 204, saldo: 2200, saldoInicial: 2000 }],
    saldoInicial: 2000, dataSaldoInicial: '2025-01-01', dataSaldo: '2026-05-10',
  },
  {
    id: 9, descricao: 'Carro Teste', status: false, valor: 30000, data: '2028-06-01', taxa: 0.008, saldo: 0,
    contas: [{ conta: 204, saldo: 0, saldoInicial: 0 }],
    saldoInicial: 0, dataSaldoInicial: '2026-03-01', dataSaldo: null,
  },
  {
    id: 10, descricao: 'Meta Inativa Teste', status: false, valor: 1000, data: '2027-01-01', taxa: 0, saldo: 0,
    contas: [{ conta: 204, saldo: 0, saldoInicial: 0 }],
    saldoInicial: 0, dataSaldoInicial: '2026-01-01', dataSaldo: null,
  },
  {
    id: 11, descricao: 'Meta Duas Contas Teste', status: true, valor: 2000, data: '2027-06-01', taxa: 0, saldo: 0,
    contas: [{ conta: 201, saldo: 0, saldoInicial: 0 }, { conta: 204, saldo: 0, saldoInicial: 0 }],
    saldoInicial: 0, dataSaldoInicial: '2026-11-01', dataSaldo: null,
  },
];
