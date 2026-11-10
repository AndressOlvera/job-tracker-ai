/**
 * Cómo vuelve el formulario a la lista con los mismos filtros (ADR-013).
 *
 * La lista abre el formulario (`+ Nueva postulación`, ✎ editar) con `state={{ returnTo }}`, donde
 * `returnTo` es la ruta y la búsqueda de la lista (p. ej. `/?status=interview&page=2`).
 *
 * El formulario (issue #14) lo lee con `getReturnTo(useLocation().state)` y navega a ese valor al
 * guardar o cancelar. Si el formulario se abrió en una pestaña nueva, o se escribió la dirección a
 * mano, no hay `state` y `getReturnTo` devuelve `/`.
 */
export interface ListReturnState {
  returnTo: string;
}

export const DEFAULT_RETURN_TO = '/';

// eslint-disable-next-line no-control-regex -- justo lo que se quiere rechazar
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/** Ruta de la lista (con su búsqueda) para guardarla en el `state` de un enlace. */
export function listReturnState(location: { pathname: string; search: string }): ListReturnState {
  return { returnTo: `${location.pathname}${location.search}` };
}

/**
 * Lee `returnTo` de `location.state`. Solo acepta rutas internas: el `state` del historial lo
 * puede alterar quien edite la entrada, y `//otro-sitio.com` sacaría al usuario de la app.
 */
export function getReturnTo(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('returnTo' in state)) {
    return DEFAULT_RETURN_TO;
  }
  const { returnTo } = state;
  if (typeof returnTo !== 'string') return DEFAULT_RETURN_TO;
  const isInternal = returnTo.startsWith('/') && !returnTo.startsWith('//');
  // El navegador descarta tabuladores y saltos de línea al interpretar una URL: `/\t/evil.com`
  // se volvería `//evil.com`. Un `\` también se toma como `/`.
  const hasUnsafeChars = CONTROL_OR_BACKSLASH.test(returnTo);
  return isInternal && !hasUnsafeChars ? returnTo : DEFAULT_RETURN_TO;
}
