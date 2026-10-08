type CsvValue = string | number | null | undefined;

function escapeField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV: comma-separated, CRLF line endings, fields quoted only when needed. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((row) => row.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
