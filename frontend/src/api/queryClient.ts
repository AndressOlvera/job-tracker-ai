import { QueryClient } from '@tanstack/react-query';

/** Reintentos ante fallas de red o del servidor (ADR-012). */
const MAX_RETRIES = 2;

/**
 * Lee el código HTTP de un error, si lo trae.
 * La issue #12 crea `ApiError` con su `status`; aquí basta con que el error tenga un `status` numérico.
 * Un error de red (`TypeError` de `fetch`) no tiene `status`.
 */
function getHttpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/**
 * Decide si una consulta fallida se vuelve a intentar (ADR-012).
 * Un `4xx` no se reintenta: repetir la misma petición daría el mismo error (p. ej. un `404`).
 * Los errores de red y los `5xx` sí, hasta dos veces. `failureCount` empieza en 0.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < MAX_RETRIES;
}

/**
 * Crea el QueryClient de la app. Las mutaciones conservan el valor por defecto (sin reintentos)
 * para no duplicar un registro si el servidor alcanzó a guardarlo.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
    },
  });
}
