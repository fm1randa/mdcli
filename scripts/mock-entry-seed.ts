import type { Entry } from '../src/types/index.js';

// Seeded entries for GET/PUT/DELETE /v1/lancamentos/:id.

type ScheduledSeed = Omit<Entry, 'dataEfetiva' | 'transferencia' | 'status' | 'tipo'> & {
  status: 'agendado';
  tipo: 'd' | 'r';
};

type SettledEntrySeed = Omit<Entry, 'dataEfetiva' | 'transferencia' | 'status' | 'tipo'> & {
  status: 'conciliado' | 'confirmado';
  tipo: 'd' | 'r';
  dataEfetiva: string;
};

type SettledTransferSeed = Omit<Entry, 'dataEfetiva' | 'transferencia' | 'status' | 'tipo'> & {
  status: 'conciliado' | 'confirmado';
  tipo: 't' | 'p';
  dataEfetiva: string;
  transferencia: number;
};

type SeedEntry = ScheduledSeed | SettledEntrySeed | SettledTransferSeed;

const SEED_ENTRIES = {
  50: {
    id: 50,
    descricao: 'Poupança',
    tipo: 't',
    valor: -1000,
    valorT: 1000,
    data: '2026-01-15',
    dataPrevista: '2026-01-15',
    dataEfetiva: '2026-01-15',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    contaT: 203,
    transferencia: 51,
    regime: 'ca',
    categoria: 30,
    tags: [],
    observacoes: '',
  },
  60: {
    id: 60,
    descricao: 'Notebook',
    tipo: 'd',
    valor: -250,
    data: '2026-01-10',
    dataPrevista: '2026-01-10',
    dataEfetiva: '2026-01-10',
    dataCompetencia: '2026-01-10',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    categoria: 10,
    categoriaPai: 0,
    parcela: '2/6',
    agendaId: 99,
    agenda: { frequencia: 1, intervalo: 'M', quantidade: 6, primeiraData: '2025-12-10' },
    regime: 'ca',
    plastico: 62,
    tags: [501],
    observacoes: 'parcelado',
    ndocumento: 'NF-1',
    lembrete: 0,
    automatico: false,
    exibirCp: true,
    exibirCr: true,
    estorno: false,
  },
  // A future occurrence of a fixed monthly series (#65): scheduled, so no
  // effective date or value yet.
  80: {
    id: 80,
    descricao: 'Assinatura Teste',
    tipo: 'd',
    valor: -45,
    valorPrevisto: -45,
    data: '2027-01-10',
    dataPrevista: '2027-01-10',
    status: 'agendado',
    conciliado: false,
    conta: 201,
    categoria: 10,
    parcela: 'fixa',
    agendaId: 77,
    agenda: { frequencia: 1, intervalo: 'M', quantidade: -1, primeiraData: '2026-11-10' },
    tags: [],
  },
  // A transfer between two regular accounts, Conta Teste -> Poupança (#123),
  // dated outside the months the list steps read.
  52: {
    id: 52,
    descricao: 'Reserva',
    tipo: 't',
    valor: -300,
    valorT: 300,
    data: '2025-06-15',
    dataPrevista: '2025-06-15',
    dataEfetiva: '2025-06-15',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    contaT: 204,
    transferencia: 53,
    categoria: 30,
    tags: [],
    observacoes: '',
  },
  70: {
    id: 70,
    descricao: 'Café',
    tipo: 'd',
    valor: -12.5,
    data: '2026-01-12',
    dataPrevista: '2026-01-12',
    dataEfetiva: '2026-01-14',
    status: 'conciliado',
    conciliado: true,
    conta: 201,
    categoria: 10,
    tags: [],
  },
  // A refund as the server stored one (Real use 2026-10-27): tipo r with a
  // negative value and estorno on, which the web app never sends - update -T
  // income has to fix both.
  71: {
    id: 71,
    descricao: 'Estorno Teste',
    tipo: 'r',
    valor: -1700,
    valorPrevisto: -1700,
    valorEfetivo: -1700,
    data: '2026-01-12',
    dataPrevista: '2026-01-12',
    dataEfetiva: '2026-01-12',
    dataReconhecimento: '2026-01-12',
    status: 'conciliado',
    conciliado: true,
    estorno: true,
    conta: 204,
    categoria: 20,
    tags: [],
  },
} satisfies Record<number, SeedEntry>;

export const SEEDED_ENTRIES: Record<number, Entry> = { ...SEED_ENTRIES };

function rejectedSeedShapes(): void {
  // @ts-expect-error a reconciled expense omits transferencia
  const withTransfer: SeedEntry = { id: 1, descricao: 'x', tipo: 'd', status: 'conciliado', valor: -1, data: '2026-01-10', dataPrevista: '2026-01-10', dataEfetiva: '2026-01-10', conta: 1, transferencia: 0 };
  // @ts-expect-error a reconciled expense requires dataEfetiva
  const missingDate: SeedEntry = { id: 1, descricao: 'x', tipo: 'd', status: 'conciliado', valor: -1, data: '2026-01-10', dataPrevista: '2026-01-10', conta: 1 };
  // @ts-expect-error a scheduled row omits dataEfetiva
  const datedSchedule: SeedEntry = { id: 1, descricao: 'x', tipo: 'd', status: 'agendado', valor: -1, data: '2027-01-10', dataPrevista: '2027-01-10', dataEfetiva: '2027-01-10', conta: 1 };
  void withTransfer;
  void missingDate;
  void datedSchedule;
}

void rejectedSeedShapes;
