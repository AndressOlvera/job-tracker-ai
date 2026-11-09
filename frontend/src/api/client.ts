/**
 * Cliente de la API (docs/03-api.md): una función por endpoint. Las pantallas no lo llaman
 * directo sino a través de los hooks de `queries.ts` (ADR-012).
 */
import type {
  Application,
  ApplicationFilters,
  ApplicationInput,
  ApplicationList,
  ApplicationPatch,
  ApiErrorBody,
  ApiErrorCode,
  Health,
  Stats,
  ValidationDetails,
} from './types';

/** Ruta relativa: el navegador habla con el mismo origen que sirve la app (ADR-005). */
const API_BASE = '/api/v1';

/**
 * Códigos que pone el cliente cuando no hay un error de la API que leer:
 * - `network_error`: no hubo respuesta (sin conexión, el servidor no contestó).
 * - `service_unavailable`: un `502`, `503` o `504` sin el formato de la API, p. ej. la página de
 *   error de CloudFront o de Nginx cuando la API está apagada.
 * - `unexpected_response`: cualquier otra respuesta que no trae el JSON esperado.
 */
export type ClientErrorCode = 'network_error' | 'service_unavailable' | 'unexpected_response';

export const NETWORK_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.';
export const SERVICE_UNAVAILABLE_MESSAGE =
  'El servidor no está disponible en este momento. Intenta de nuevo en unos minutos.';
export const UNEXPECTED_RESPONSE_MESSAGE =
  'El servidor respondió de forma inesperada. Intenta de nuevo.';

interface ApiErrorInit {
  status: number | undefined;
  code: ApiErrorCode | ClientErrorCode;
  message: string;
  details?: ValidationDetails;
  cause?: unknown;
}

/**
 * Error de cualquier llamada a la API. `message` siempre está en español y se puede mostrar
 * tal cual. `status` es el código HTTP; un error de red no tiene, y así `shouldRetry` lo reintenta.
 */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: ApiErrorCode | ClientErrorCode;
  /** Errores por campo de un `422`. Los de todo el cuerpo van en la llave `body`. */
  readonly details: ValidationDetails | undefined;

  constructor({ status, code, message, details, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Hace la petición y devuelve el JSON de la respuesta (o `undefined` en un `204`).
 * Cualquier falla se convierte en `ApiError`, salvo la cancelación: TanStack Query aborta la
 * petición anterior al cambiar un filtro y necesita recibir el `AbortError` tal cual (ADR-012).
 */
async function request<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers, signal };
  if (body !== undefined) {
    // Sin este encabezado la API responde `415`.
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    throw new ApiError({
      status: undefined,
      code: 'network_error',
      message: NETWORK_ERROR_MESSAGE,
      cause: error,
    });
  }

  if (!response.ok) throw await toApiError(response, signal);
  if (response.status === 204) return undefined as T;

  const data = await readJson(response, signal);
  if (data === undefined) {
    throw new ApiError({
      status: response.status,
      code: 'unexpected_response',
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  }
  return data as T;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/** Lee el cuerpo como JSON; `undefined` si no lo es (JSON nunca produce `undefined`). */
async function readJson(response: Response, signal: AbortSignal | undefined): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    return undefined;
  }
}

async function toApiError(response: Response, signal: AbortSignal | undefined) {
  const { status } = response;
  const body = await readJson(response, signal);
  if (isApiErrorBody(body)) {
    const { code, message, details } = body.error;
    return new ApiError({ status, code, message, details });
  }
  // Una página de error del proxy o el `503` de `/health`, que no usan el formato de errores.
  const unavailable = status === 502 || status === 503 || status === 504;
  return new ApiError({
    status,
    code: unavailable ? 'service_unavailable' : 'unexpected_response',
    message: unavailable ? SERVICE_UNAVAILABLE_MESSAGE : UNEXPECTED_RESPONSE_MESSAGE,
  });
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/** Orden fijo de los parámetros: la misma búsqueda produce siempre la misma URL. */
const FILTER_PARAMS = [
  'status',
  'q',
  'applied_from',
  'applied_to',
  'sort',
  'page',
  'per_page',
] as const satisfies readonly (keyof ApplicationFilters)[];

/**
 * Quita los filtros sin valor. Para la API, un parámetro vacío (`?status=`) equivale a no
 * mandarlo; quitarlo deja la URL limpia y hace que `{}` y `{ q: '' }` compartan caché.
 */
export function compactFilters(filters: ApplicationFilters): ApplicationFilters {
  const compact: Record<string, string | number> = {};
  for (const key of FILTER_PARAMS) {
    const value = filters[key];
    if (value !== undefined && value !== '') compact[key] = value;
  }
  return compact as ApplicationFilters;
}

function toQueryString(filters: ApplicationFilters): string {
  // URLSearchParams codifica `%`, `&`, espacios y acentos.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(compactFilters(filters))) {
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** `GET /health`. Un `503` (base de datos caída) llega como `ApiError` `service_unavailable`. */
export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>('/health', { signal });
}

/** `GET /applications` con filtros, orden y paginación. */
export function listApplications(
  filters: ApplicationFilters = {},
  signal?: AbortSignal,
): Promise<ApplicationList> {
  return request<ApplicationList>(`/applications${toQueryString(filters)}`, { signal });
}

/** `GET /applications/{id}`. Si no existe: `ApiError` con `status` 404. */
export function getApplication(id: number, signal?: AbortSignal): Promise<Application> {
  return request<Application>(`/applications/${id}`, { signal });
}

/** `POST /applications`. Devuelve la postulación creada, con su `id`. */
export function createApplication(input: ApplicationInput): Promise<Application> {
  return request<Application>('/applications', { method: 'POST', body: input });
}

/** `PATCH /applications/{id}` con solo los campos que cambian. Devuelve la versión nueva. */
export function updateApplication(id: number, patch: ApplicationPatch): Promise<Application> {
  return request<Application>(`/applications/${id}`, { method: 'PATCH', body: patch });
}

/** `DELETE /applications/{id}`. La API responde `204` sin cuerpo. */
export async function deleteApplication(id: number): Promise<void> {
  await request<void>(`/applications/${id}`, { method: 'DELETE' });
}

/** `GET /stats`. */
export function getStats(signal?: AbortSignal): Promise<Stats> {
  return request<Stats>('/stats', { signal });
}
