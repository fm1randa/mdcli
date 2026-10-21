// Room "..." takes at the end of a cut cell.
const ELLIPSIS = '...';

/**
 * Cuts text that would not fit a table column of colWidth characters,
 * ending it with "...". Pass the same width given to the table's colWidths,
 * so a column's width lives in one place (Jardinagem 2026-10-21).
 */
export function truncate(text: string, colWidth: number): string {
  const room = colWidth - ELLIPSIS.length;
  return text.length > room ? `${text.slice(0, room)}${ELLIPSIS}` : text;
}
