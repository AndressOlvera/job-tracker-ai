/** Formatos de México para la lista (docs/04-pantallas.md). */

const numberFormat = new Intl.NumberFormat('es-MX');

/** `1234` -> `1,234`. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/**
 * `2026-09-28` -> `28/09/2026`. Se reordena el texto en lugar de pasar por `new Date()`: una
 * fecha sin hora se interpreta como UTC y, en México (UTC-6), se mostraría un día antes (ADR-009).
 * Si el texto no tiene la forma esperada se devuelve tal cual, para no ocultar el dato.
 */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

/** Solo `http:` y `https:`: un `javascript:` que llegara en `job_url` no debe volverse enlace. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
