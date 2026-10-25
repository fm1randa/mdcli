import { addInterval, isCalendarDate } from '../../../lib/dates.js';
import type { ImportCandidate } from './candidates.js';
import { asRecord, numberOrNull, textOrNull } from '../../../lib/payload.js';
import { learnedFields } from './suggest.js';

interface ParsedBankTransaction {
  integrationId: string | null;
  date: string | null;
  value: number | null;
  description: string | null;
  categoryId: number | null;
  suggestedDescription: string | null;
  suggestedTagIds: number[];
}

export interface SuggestedCategory {
  id: number;
  name: string | null;
  source: 'rule' | 'ai';
}

export interface BankTransactionRow {
  integrationId: string | null;
  prefix: string | null;
  date: string | null;
  value: number | null;
  description: string | null;
  suggestedDescription: string | null;
  suggestedTagIds: number[];
  suggestedCategory: SuggestedCategory | null;
  duplicateOf: number | null;
  /** The Entry the web links on its own (one per row, one row per Entry); `conciliate` uses it. */
  conciliateWith: number | null;
  candidates: ImportCandidate[];
  defaultAction: 'import' | 'needs-category' | 'skip' | 'conciliate';
}

export interface ImportDocument {
  account: { id: number; name: string | null };
  connection: { id: number; connectionAccount: number };
  /**
   * `summary`: the new Bank Transactions the connection reports (no --since, when it has any).
   * `statement`: everything since `since`, --since or the web's default start date.
   */
  source: ImportSource;
  since: string | null;
  statement: { start: string | null; end: string | null; balance: number | null };
  search: { from: string | null; to: string | null };
  ai: 'ok' | 'unavailable' | 'unused';
  /** The Bank Transactions. The key is part of the `--json` contract. */
  transactions: BankTransactionRow[];
}

export type ImportSource = 'summary' | 'statement';

export function toImportDocument(input: {
  accountId: number;
  accountName: string | null;
  connectionId: number;
  connectionAccount: number;
  source: ImportSource;
  since: string | null;
  payload: unknown;
}): ImportDocument {
  const origin = input.source === 'summary'
    ? 'The summary of GET /v1/integracao/connections'
    : `GET /v1/integracao/account/${input.connectionAccount}/transactions`;
  const record = asRecord(input.payload);
  if (!record) throw new Error(`${origin} did not return a statement`);
  const rows = record.lancamentos;
  if (rows !== undefined && !Array.isArray(rows)) throw new Error(`${origin} did not return lancamentos`);
  const items = (Array.isArray(rows) ? rows : []).map(readBankTransaction);
  const prefixes = uniquePrefixes(items.map((item) => item.integrationId));
  const start = textOrNull(record.inicio);
  const end = textOrNull(record.fim);
  return {
    account: { id: input.accountId, name: input.accountName },
    connection: { id: input.connectionId, connectionAccount: input.connectionAccount },
    source: input.source,
    since: input.since,
    statement: { start, end, balance: numberOrNull(record.saldo) },
    search: searchWindow(start, end),
    ai: 'unused',
    transactions: items.map((item, index) => toBankTransactionRow(item, prefixes[index] ?? null)),
  };
}

function readBankTransaction(value: unknown): ParsedBankTransaction {
  const record = asRecord(value);
  const learned = learnedFields(value);
  return {
    integrationId: textOrNull(record?.integrationId),
    date: textOrNull(record?.data),
    value: numberOrNull(record?.valor),
    description: textOrNull(record?.descricao),
    categoryId: learned.categoryId,
    suggestedDescription: learned.suggestedDescription,
    suggestedTagIds: learned.suggestedTagIds,
  };
}

function toBankTransactionRow(item: ParsedBankTransaction, prefix: string | null): BankTransactionRow {
  const suggestedCategory = item.categoryId === null
    ? null
    : { id: item.categoryId, name: null, source: 'rule' as const };
  return {
    integrationId: item.integrationId,
    prefix,
    date: item.date,
    value: item.value,
    description: item.description,
    suggestedDescription: item.suggestedDescription,
    suggestedTagIds: item.suggestedTagIds,
    suggestedCategory,
    duplicateOf: null,
    conciliateWith: null,
    candidates: [],
    defaultAction: suggestedCategory === null ? 'needs-category' : 'import',
  };
}

/** Statement period expanded by 2 days on each side (the web app's default search). */
function searchWindow(start: string | null, end: string | null): { from: string | null; to: string | null } {
  if (start === null || end === null || !isCalendarDate(start) || !isCalendarDate(end)) {
    return { from: null, to: null };
  }
  return { from: addInterval(start, -2, 'd'), to: addInterval(end, 2, 'd') };
}

/** At least 8 characters, grown until unique in this list. Comparison ignores case. */
function uniquePrefixes(ids: readonly (string | null)[]): (string | null)[] {
  const known: string[] = [];
  for (const id of ids) {
    if (id !== null) known.push(id.toLowerCase());
  }
  return ids.map((id) => {
    if (id === null) return null;
    return id.slice(0, prefixLength(id.toLowerCase(), known));
  });
}

function prefixLength(mine: string, all: readonly string[]): number {
  const start = Math.min(8, mine.length);
  for (let length = start; length < mine.length; length += 1) {
    const head = mine.slice(0, length);
    let count = 0;
    for (const other of all) {
      if (other.startsWith(head)) count += 1;
    }
    if (count === 1) return length;
  }
  return mine.length;
}
