/**
 * Filtros de la lista <-> URL (ADR-013). La URL es la única fuente de verdad: este archivo la lee
 * como filtros válidos y los vuelve a escribir. Son funciones puras, sin React.
 *
 * Todo lo que llega por la URL puede estar escrito a mano, así que lo inválido se ignora en vez
 * de romper la pantalla:
 * - `status` que no existe, `sort` fuera de la lista y `q` vacío (solo espacios) se descartan.
 * - Una fecha mal escrita o imposible (`2026-02-31`) se descarta.
 * - `page` que no sea un entero entre 1 y `MAX_PAGE` vale 1.
 * - `applied_from` posterior a `applied_to`: la API respondería 422, así que se descartan las
 *   DOS fechas (no hay forma de saber cuál quiso el usuario). Desde la interfaz no se llega a
 *   ese caso: `changeFilters` conserva la fecha que acaba de elegir y quita la contradictoria.
 */
import { isApplicationStatus, type ApplicationStatus } from '../../api/status';
import {
  isApplicationSort,
  type ApplicationFilters,
  type ApplicationSort,
  type IsoDate,
  type SortField,
} from '../../api/types';

/** Elementos por página. Fijo: no va en la URL. */
export const PER_PAGE = 20;
/** Igual que el valor por defecto de la API: la fecha más reciente primero. */
export const DEFAULT_SORT: ApplicationSort = '-applied_on';
/** Límite de `q` en la API (docs/03-api.md). */
export const MAX_QUERY_LENGTH = 100;
/** Una página absurda (`?page=99999999999999999999`) desbordaría el OFFSET de la base de datos. */
export const MAX_PAGE = 1_000_000;

/** Filtros de la lista ya validados. */
export interface ListFilters {
  status?: ApplicationStatus;
  q?: string;
  applied_from?: IsoDate;
  applied_to?: IsoDate;
  sort: ApplicationSort;
  page: number;
}

/** Los filtros por defecto: lista sin filtrar, primera página. */
export const DEFAULT_FILTERS: ListFilters = { sort: DEFAULT_SORT, page: 1 };

/** Recorta espacios y el largo máximo. Un texto vacío significa "sin búsqueda". */
export function normalizeQuery(text: string): string {
  return text.trim().slice(0, MAX_QUERY_LENGTH).trim();
}

/** `YYYY-MM-DD` de un día que existe en el calendario. No pasa por zonas horarias. */
export function isValidIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // `setUTCFullYear` (a diferencia de `Date.UTC`) no convierte los años 0-99 en 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseDate(value: string | null): IsoDate | undefined {
  return isValidIsoDate(value) ? value : undefined;
}

function parsePage(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

/** Convierte la URL en filtros válidos. Nunca lanza. */
export function parseListSearch(params: URLSearchParams): ListFilters {
  const status = params.get('status');
  const sort = params.get('sort');
  const q = normalizeQuery(params.get('q') ?? '');
  let appliedFrom = parseDate(params.get('applied_from'));
  let appliedTo = parseDate(params.get('applied_to'));
  if (appliedFrom && appliedTo && appliedFrom > appliedTo) {
    appliedFrom = undefined;
    appliedTo = undefined;
  }

  const filters: ListFilters = {
    sort: isApplicationSort(sort) ? sort : DEFAULT_SORT,
    page: parsePage(params.get('page')),
  };
  if (isApplicationStatus(status)) filters.status = status;
  if (q) filters.q = q;
  if (appliedFrom) filters.applied_from = appliedFrom;
  if (appliedTo) filters.applied_to = appliedTo;
  return filters;
}

/**
 * Convierte los filtros en URL. Los valores por defecto (`sort=-applied_on`, `page=1`) no se
 * escriben, así `/` es la lista sin filtrar. El orden de los parámetros es siempre el mismo.
 */
export function toSearchParams(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  if (filters.applied_from) params.set('applied_from', filters.applied_from);
  if (filters.applied_to) params.set('applied_to', filters.applied_to);
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/**
 * Aplica un cambio del usuario. Cualquier cambio de filtro, búsqueda u orden regresa a la
 * página 1; solo un cambio de `page` la conserva. Si la fecha nueva contradice a la otra (un
 * "Desde" posterior al "Hasta"), gana la que acaba de elegir y se quita la otra.
 */
export function changeFilters(
  current: ListFilters,
  change: Partial<Omit<ListFilters, 'page'>> & { page?: number },
): ListFilters {
  const next: ListFilters = { ...current, ...change, page: change.page ?? 1 };
  if (next.applied_from && next.applied_to && next.applied_from > next.applied_to) {
    if ('applied_from' in change) delete next.applied_to;
    else delete next.applied_from;
  }
  // Un valor vacío (`undefined`, `''`) quita el filtro en lugar de quedarse como llave vacía.
  for (const key of ['status', 'q', 'applied_from', 'applied_to'] as const) {
    if (!next[key]) delete next[key];
  }
  return next;
}

/** Hay algún filtro (estado, búsqueda o fechas) que "Limpiar filtros" quitaría. El orden no cuenta. */
export function hasActiveFilters(filters: ListFilters): boolean {
  return Boolean(filters.status || filters.q || filters.applied_from || filters.applied_to);
}

/** Los mismos filtros sin estado, búsqueda ni fechas, pero con el orden elegido. */
export function clearFilters(filters: ListFilters): ListFilters {
  return { sort: filters.sort, page: 1 };
}

/** Parámetros de `GET /applications`: siempre explícitos, así la llave de caché es estable. */
export function toApiFilters(filters: ListFilters): ApplicationFilters {
  return { ...filters, per_page: PER_PAGE };
}

/** Dirección de `sort` en la que empieza cada columna: la fecha, de la más reciente; el resto, A-Z. */
const FIRST_DIRECTION: Record<SortField, 'asc' | 'desc'> = {
  applied_on: 'desc',
  created_at: 'desc',
  company: 'asc',
  status: 'asc',
};

/** Campo y dirección de un `sort` (`-company` -> `company`, `desc`). */
export function describeSort(sort: ApplicationSort): {
  field: SortField;
  direction: 'asc' | 'desc';
} {
  return sort.startsWith('-')
    ? { field: sort.slice(1) as SortField, direction: 'desc' }
    : { field: sort as SortField, direction: 'asc' };
}

/**
 * El `sort` que sigue al hacer clic en el encabezado de `field`: si ya se ordena por esa columna
 * se invierte la dirección; si es otra, empieza en su dirección natural.
 */
export function nextSort(current: ApplicationSort, field: SortField): ApplicationSort {
  const { field: currentField, direction } = describeSort(current);
  const nextDirection =
    currentField === field ? (direction === 'asc' ? 'desc' : 'asc') : FIRST_DIRECTION[field];
  return nextDirection === 'desc' ? `-${field}` : field;
}
