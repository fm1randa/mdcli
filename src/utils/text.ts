import chalk from 'chalk';

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

/**
 * A table cell: the value (through `format` when given), or a gray dash when
 * there is none. The only place that writes the dash (local/no-raw-dash).
 */
export function cell(value: string | number | null | undefined): string;
export function cell<T>(value: T | null | undefined, format: (value: T) => string): string;
export function cell<T>(value: T | null | undefined, format?: (value: T) => string): string {
  if (value === null || value === undefined) return chalk.gray('-');
  return format ? format(value) : String(value);
}

/** A table cell listing the items (through `format`) separated by commas, or the dash when empty. */
export function listCell<T>(items: readonly T[], format: (item: T) => string = String): string {
  return cell(items.length === 0 ? null : items.map((item) => format(item)).join(', '));
}
