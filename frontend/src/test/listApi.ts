import { screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { Application } from '../api/types';
import { jsonResponse, makeApplication, makeApplicationList, makeStats } from './api';

/**
 * Ayudas para probar la pantalla de la lista de punta a punta con `fetch` simulado. Las usan las
 * pruebas de aceptación de la issue #13 (`ApplicationsPage.*.test.tsx`).
 */

export type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

export function makeItems(count: number, firstId = 1): Application[] {
  return Array.from({ length: count }, (_, index) =>
    makeApplication({
      id: firstId + index,
      company: `Empresa ${firstId + index}`,
      position: `Puesto ${firstId + index}`,
    }),
  );
}

/** 24 postulaciones en 2 páginas de 20, como el boceto de docs/04-pantallas.md. */
export function pagedList(url: URL): Response {
  const page = Number(url.searchParams.get('page') ?? 1);
  const items = page === 1 ? makeItems(20) : page === 2 ? makeItems(4, 21) : [];
  return jsonResponse(makeApplicationList(items, { page, total: 24 }));
}

/** Simula la API con `fetch`. Cada prueba decide qué responde la lista y las estadísticas. */
export function stubApi({ list = pagedList, stats }: { list?: Handler; stats?: Handler } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/v1/stats')
      return stats ? stats(url, init) : jsonResponse(makeStats());
    if (url.pathname === '/api/v1/applications') return list(url, init);
    throw new Error(`Petición inesperada: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  /** URL de cada petición a la lista, en orden. */
  function listUrls() {
    return fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => url.pathname === '/api/v1/applications');
  }
  /** Parámetros de cada petición a la lista, en orden. */
  function listRequests() {
    return listUrls().map((url) => Object.fromEntries(url.searchParams));
  }
  return { fetchMock, listUrls, listRequests };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function findTable() {
  return screen.findByRole('table', { name: 'Postulaciones' });
}

export function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

/** Nombre accesible del elemento que tiene el foco (para recorrer la pantalla con Tab). */
export function focusedName(): string {
  const element = document.activeElement;
  if (!element || element === document.body) return '(body)';
  const label = element instanceof HTMLInputElement ? element.labels?.[0]?.textContent : null;
  return (
    element.getAttribute('aria-label') ?? label ?? element.textContent?.trim() ?? element.tagName
  );
}

/**
 * Una API en memoria que filtra, ordena y pagina como docs/03-api.md: `q` sin distinguir
 * mayúsculas en empresa y puesto, fechas inclusivas, `sort` con `-` y `per_page`.
 */
export function fakeBackend(all: Application[]): Handler {
  return (url) => {
    const params = url.searchParams;
    const status = params.get('status');
    const q = params.get('q')?.toLowerCase();
    const from = params.get('applied_from');
    const to = params.get('applied_to');
    const sort = params.get('sort') ?? '-applied_on';
    const page = Number(params.get('page') ?? 1);
    const perPage = Number(params.get('per_page') ?? 20);

    const filtered = all
      .filter((item) => !status || item.status === status)
      .filter(
        (item) =>
          !q || item.company.toLowerCase().includes(q) || item.position.toLowerCase().includes(q),
      )
      .filter((item) => !from || item.applied_on >= from)
      .filter((item) => !to || item.applied_on <= to);

    const field = sort.replace('-', '') as keyof Application;
    const direction = sort.startsWith('-') ? -1 : 1;
    filtered.sort((a, b) => direction * String(a[field]).localeCompare(String(b[field])));

    const start = (page - 1) * perPage;
    return jsonResponse(
      makeApplicationList(filtered.slice(start, start + perPage), {
        page,
        per_page: perPage,
        total: filtered.length,
      }),
    );
  };
}
