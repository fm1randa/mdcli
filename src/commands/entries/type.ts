/** Entry sign rules: the web app signs value fields from the entry type
 * (md.js, Tt; PR #138 followed the web bundle at
 * cdn.meudinheiroweb.com.br/js/md.js / mdb.js: valor = (tipo != 'r' ? -1 : 1) * |valor|).
 *
 * Transfers/payments keep the same convention: r is positive; everything else is
 * negative, except invoice payments (p) which keep their existing sign (0) when
 * edited because the web locks their type.
 */
export function signForType(tipo: string | undefined): 1 | -1 | 0 {
  if (tipo === 'r') return 1;
  if (tipo === 'd' || tipo === 't') return -1;
  if (tipo === 'p') return 0;
  return -1;
}
