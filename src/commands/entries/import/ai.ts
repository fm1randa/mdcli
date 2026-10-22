import { suggestCategoriesWithAi } from '../../../lib/api.js';
import type { Category } from '../../../types/index.js';
import type { ImportDocument } from './document.js';
import { idOrNull } from '../../../lib/payload.js';
import type { AiRequest } from './suggest.js';

/**
 * Rows without a rule category and without exactly one automatic candidate send
 * their `_ca.ait` token to the AI. Any failure leaves the rule suggestions as
 * they are and marks the document `unavailable`; it does not fail the listing.
 *
 * Like the web app, an AI category is kept only when the catalog has it, it is
 * active, and its tipo is the row's tipo (d, r or t). Otherwise the row stays
 * without a category.
 */
export async function fillAiCategories(
  document: ImportDocument,
  requests: readonly (AiRequest | null)[],
  automaticCounts: readonly number[],
  catalog: () => Promise<readonly Category[]>,
): Promise<void> {
  const eligible: { index: number; kind: AiRequest['kind'] }[] = [];
  document.transactions.forEach((row, index) => {
    const request = requests[index] ?? null;
    if (row.suggestedCategory !== null || request === null || automaticCounts[index] === 1) return;
    eligible.push({ index, kind: request.kind });
  });
  if (eligible.length === 0) {
    document.ai = 'unused';
    return;
  }

  const sent = eligible.map(({ index }) => requests[index]?.token);
  const answer = await suggestCategoriesWithAi(sent).catch(() => null);
  if (!Array.isArray(answer)) {
    document.ai = 'unavailable';
    return;
  }
  document.ai = 'ok';
  const answered = eligible.flatMap(({ index, kind }, position) => {
    const id = idOrNull(answer[position]);
    return id === null ? [] : [{ index, kind, id }];
  });
  if (answered.length === 0) return;
  const byId = new Map((await catalog()).map((category) => [category.id, category]));
  for (const { index, kind, id } of answered) {
    const category = byId.get(id);
    const row = document.transactions[index];
    if (category === undefined || category.status === false || category.tipo !== kind || row === undefined) continue;
    row.suggestedCategory = { id, name: null, source: 'ai' };
    if (row.defaultAction === 'needs-category') row.defaultAction = 'import';
  }
}
