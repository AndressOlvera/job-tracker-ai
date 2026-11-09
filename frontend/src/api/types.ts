/**
 * Tipos del contrato de la API (docs/03-api.md). Los campos van en `snake_case`, igual que en el
 * JSON, para no traducir nombres entre la API y las pantallas.
 * Las fechas llegan como texto: `YYYY-MM-DD` las de calendario e ISO 8601 con zona las de fecha y hora.
 */
import type { ApplicationStatus } from './status';

export type { ApplicationStatus } from './status';

/** Fecha de calendario `YYYY-MM-DD` (p. ej. `2026-10-03`). */
export type IsoDate = string;

/** Fecha y hora ISO 8601 con zona (p. ej. `2026-09-28T17:05:11Z`). */
export type IsoDateTime = string;

/** Objeto `Application` tal como lo devuelve la API. */
export interface Application {
  id: number;
  company: string;
  position: string;
  status: ApplicationStatus;
  applied_on: IsoDate;
  job_url: string | null;
  source: string | null;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/**
 * Cuerpo de `POST /applications`. `id`, `created_at` y `updated_at` no existen aquí porque la API
 * rechaza el cuerpo si los trae. Sin `status` la API guarda `applied`; sin `applied_on`, la fecha
 * de hoy. Un opcional vacío (`""`) se guarda como `null`.
 */
export interface ApplicationInput {
  company: string;
  position: string;
  status?: ApplicationStatus;
  applied_on?: IsoDate;
  job_url?: string;
  source?: string;
  notes?: string;
}

/**
 * Cuerpo de `PATCH /applications/{id}`: solo los campos que cambian. Los opcionales se vacían
 * con `null`. La API responde `422` si el cuerpo está vacío.
 */
export interface ApplicationPatch {
  company?: string;
  position?: string;
  status?: ApplicationStatus;
  applied_on?: IsoDate;
  job_url?: string | null;
  source?: string | null;
  notes?: string | null;
}

/** Campos por los que se puede ordenar la lista. */
export const SORT_FIELDS = ['applied_on', 'company', 'status', 'created_at'] as const;

export type SortField = (typeof SORT_FIELDS)[number];

/** Orden de la lista: el campo, con `-` al inicio si es descendente (p. ej. `-applied_on`). */
export type ApplicationSort = SortField | `-${SortField}`;

/** Los 8 valores de `sort` que acepta la API, para validar lo que llega por la URL (ADR-013). */
export const APPLICATION_SORTS: readonly ApplicationSort[] = SORT_FIELDS.flatMap(
  (field): ApplicationSort[] => [field, `-${field}`],
);

export function isApplicationSort(value: unknown): value is ApplicationSort {
  return (APPLICATION_SORTS as readonly unknown[]).includes(value);
}

/**
 * Parámetros de `GET /applications`, todos opcionales. Si falta uno, la API usa su valor por
 * defecto: `sort=-applied_on`, `page=1`, `per_page=20`.
 */
export interface ApplicationFilters {
  status?: ApplicationStatus;
  /** Busca en empresa y puesto, sin distinguir mayúsculas. Hasta 100 caracteres. */
  q?: string;
  /** Fecha de postulación mayor o igual. */
  applied_from?: IsoDate;
  /** Fecha de postulación menor o igual. */
  applied_to?: IsoDate;
  sort?: ApplicationSort;
  /** Empieza en 1. Una página fuera de rango devuelve `items` vacío, no un error. */
  page?: number;
  /** De 1 a 100. */
  per_page?: number;
}

/** Respuesta paginada. Sin resultados, `total` y `pages` valen 0. */
export interface Paginated<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export type ApplicationList = Paginated<Application>;

/** Postulaciones de un mes (`YYYY-MM`). */
export interface MonthCount {
  month: string;
  count: number;
}

/** Respuesta de `GET /stats`. */
export interface Stats {
  total: number;
  /** Siempre trae los cuatro estados, aunque alguno valga 0. */
  by_status: Record<ApplicationStatus, number>;
  /** (`interview` + `offer` + `rejected`) / `total`, de 0 a 1 con 4 decimales. */
  response_rate: number;
  /** (`interview` + `offer`) / `total`, de 0 a 1 con 4 decimales. */
  interview_rate: number;
  /** Solo los meses con alguna postulación, del más antiguo al más reciente. */
  by_month: MonthCount[];
}

/** Respuesta de `GET /health` (`200` si todo está bien, `503` si la base de datos no responde). */
export interface Health {
  status: 'ok' | 'degraded';
  database: 'ok' | 'unreachable';
}

/** Códigos de error que manda la API (docs/03-api.md → Errores). */
export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'validation_error'
  | 'internal_error';

/**
 * Errores de validación por campo o parámetro. Los que afectan a todo el cuerpo (p. ej. un
 * `PATCH` vacío) van en la llave `body`.
 */
export type ValidationDetails = Partial<Record<string, string[]>>;

/** Cuerpo de cualquier respuesta de error de la API. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** En español, para mostrarlo tal cual. */
    message: string;
    /** Solo en errores de validación (`422`). */
    details?: ValidationDetails;
  };
}
