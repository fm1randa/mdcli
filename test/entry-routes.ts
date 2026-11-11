import type { CreateEntryResponse, Entry } from '../src/types/index.js';
import type { Body } from '../scripts/mock-http.js';
import { createdEntry, mockEntryId, updatedEntry } from '../scripts/mock-entry-payload.js';
import type { MockApi } from './helpers.js';

/** Answers the GET of `entry` and its PUT with the payload saved over it, as the API does. */
export function serveEntry(api: MockApi, entry: Entry & { id: number }): void {
  api.on(`GET /v1/lancamentos/${entry.id}`, entry);
  api.on(`PUT /v1/lancamentos/${entry.id}`, (req) => updatedEntry(entry, req.body as Body, mockEntryId(entry.id)));
}

/**
 * Answers POST /v1/lancamentos with the entry the payload creates, under `id`:
 * an entry ID, or any string, which the API answers for a card purchase or a
 * future pending entry (src/lib/entry-id-brands.ts). `fields` replace what
 * the answer would derive from the payload.
 */
export function serveCreate(api: MockApi, id: number | string = 9, fields: Partial<Omit<CreateEntryResponse, 'id'>> = {}): void {
  const answered = typeof id === 'number' ? mockEntryId(id) : id;
  api.on('POST /v1/lancamentos', (req) => ({ ...createdEntry(req.body as Body, answered), ...fields }));
}

/** A PUT /v1/lancamentos/:id answer with `fields` over synthetic defaults, for a test that fixes what the API answers. */
export function entryAnswer(id: number, fields: Partial<Omit<CreateEntryResponse, 'id'>> = {}): CreateEntryResponse {
  return {
    id: mockEntryId(id),
    descricao: 'Lançamento Teste',
    conciliado: false,
    dataCompetencia: null,
    status: 'conciliado',
    tipo: 'd',
    valor: 0,
    valorPrevisto: 0,
    valorEfetivo: null,
    data: '2026-01-05',
    dataPrevista: '2026-01-05',
    dataEfetiva: null,
    dataCriacao: '2026-01-05T00:00:00',
    exibirCp: true,
    exibirCr: true,
    permissoes: { visivel: true, acoes: { conciliar: true, confirmar: true, editar: true, excluir: true, clonar: true } },
    estorno: false,
    conta: 201,
    categoria: null,
    tags: [],
    observacoes: '',
    lembrete: '0',
    automatico: false,
    ...fields,
  };
}
