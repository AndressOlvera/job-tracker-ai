/**
 * "Hoy" para el formulario (ADR-009). Es el único lugar del frontend que calcula la fecha de hoy:
 * la fecha por defecto, el `max` del campo y la validación de "no puede ser futura" salen de aquí.
 *
 * Se usa la fecha LOCAL del navegador (`getFullYear/getMonth/getDate`) y no `toISOString()`, que
 * da la fecha en UTC: en México (UTC-6) a partir de las 6 p. m. ya sería "mañana" y el formulario
 * rechazaría o propondría un día que todavía no llega. Las pruebas fijan el reloj con
 * `vi.setSystemTime`, o pasan `now`.
 */

/** `Date` -> `AAAA-MM-DD` con los componentes locales. */
export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** La fecha de hoy en el calendario del usuario, como `AAAA-MM-DD`. */
export function getToday(now: Date = new Date()): string {
  return formatLocalDate(now);
}
