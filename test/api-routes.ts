import type {
  Account,
  AccountBalancesResponse,
  AccountsResponse,
  BankStatementResponse,
  CardFutureResponse,
  CardInvoiceResponse,
  CardPlastic,
  CategoriesResponse,
  Category,
  ConnectionsResponse,
  CreateEntryResponse,
  CreateTagResponse,
  EntriesResponse,
  Entry,
  FirstInvoiceResponse,
  LegacyCardFutureResponse,
  SyncRequestResponse,
  TagsResponse,
} from '../src/types/index.js';
import type { SessionResponse } from './fixtures.js';

/**
 * A row of an invoice projection (GET /v2/lancamentos with faturas: true): the
 * API sends it with no id, which Entry does not allow; normalizeEntry reads it
 * as invoice:<card>.
 */
export type InvoiceProjection = Omit<Entry, 'id'> & { projecaoFatura: number };

/** GET /v2/lancamentos: Entries, and the invoice projections among them. */
export type EntriesPage = Omit<EntriesResponse, 'list'> & { list: Array<Entry | InvoiceProjection> };

/**
 * The body each API route answers, keyed by "METHOD /path" (no /api prefix, no
 * query string), with the response type src/lib/api.ts reads. The test mock
 * (`api.on`) and scripts/mock-*.ts (`json`) take their payloads through it, so
 * tsc refuses a fixture the real API could not send. `null` is an empty answer
 * (204). A route the CLI reads as `unknown` stays `unknown` here: nothing
 * checks its fixtures.
 */
export interface ApiResponses {
  'GET /v1/frontend/sessao': SessionResponse;
  'GET /v1/cadastros/contas': AccountsResponse;
  'POST /v1/cadastros/contas': Account;
  [route: `PUT /v1/cadastros/contas/${number}`]: Account;
  [route: `DELETE /v1/cadastros/contas/${number}`]: null;
  'GET /v1/cadastros/categorias': CategoriesResponse;
  'POST /v1/cadastros/categorias': Category;
  [route: `PUT /v1/cadastros/categorias/${number}`]: Category;
  [route: `DELETE /v1/cadastros/categorias/${number}`]: null;
  'GET /v1/cadastros/tags': TagsResponse;
  'POST /v1/cadastros/tags': CreateTagResponse;
  [route: `PUT /v1/cadastros/tags/${number}`]: CreateTagResponse;
  [route: `DELETE /v1/cadastros/tags/${number}`]: null;
  'GET /v1/cadastros/plasticos': CardPlastic[];
  'GET /v1/integracao/connections': ConnectionsResponse;
  [route: `GET /v1/integracao/account/${number}/transactions`]: BankStatementResponse;
  [route: `PUT /v1/integracao/connection/update/${number}`]: SyncRequestResponse | null;
  'POST /v1/integracao/transactions/markImported': unknown;
  'GET /v2/lancamentos': EntriesPage | AccountBalancesResponse;
  'GET /v1/lancamentos/duplicidade': unknown;
  'POST /v1/lancamentos': CreateEntryResponse;
  [route: `GET /v1/lancamentos/${number}`]: Entry;
  [route: `PUT /v1/lancamentos/${number}`]: CreateEntryResponse;
  [route: `DELETE /v1/lancamentos/${number}`]: null;
  'POST /v1/lancamentos/conciliacao': unknown;
  'POST /v1/lancamentos/importar': unknown;
  'POST /v1/smartmatch/ai': unknown;
  [route: `GET /v1/cartoes/${number}/primeiraFatura`]: FirstInvoiceResponse | null;
  [route: `GET /v1/cartoes/${number}/fatura/${string}`]: CardInvoiceResponse;
  [route: `GET /v1/cartoes/${number}/parcelasFuturas`]: CardFutureResponse | LegacyCardFutureResponse;
}

export type ApiRoute = keyof ApiResponses;
