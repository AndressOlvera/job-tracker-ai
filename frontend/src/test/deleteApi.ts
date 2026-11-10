import { vi } from 'vitest';
import { APPLICATION_STATUSES } from '../api/status';
import type { Application } from '../api/types';
import { jsonResponse, makeStats } from './api';
import { fakeBackend } from './listApi';

/**
 * API en memoria con `DELETE` para probar la issue #15 de punta a punta: la lista, las
 * estadísticas (calculadas con lo que quede en memoria) y el borrado. Cada prueba puede cambiar
 * cómo responde `DELETE`, la lista o las estadísticas con `handlers`.
 */

export interface RecordedCall {
  method: string;
  pathname: string;
  search: string;
}

type Reply = Response | Promise<Response>;

export interface DeleteBackend {
  /** Lo que hay "en la base de datos": mutable, las pruebas lo cambian para simular a otros. */
  items: Application[];
  calls: RecordedCall[];
  handlers: {
    /** Por defecto borra y responde 204. `remove()` quita la fila de `items`. */
    delete?: (id: number, remove: () => void) => Reply;
    /** Se ejecuta antes de responder la lista (para retrasarla o hacerla fallar). */
    list?: (url: URL) => Reply | void | Promise<void>;
    stats?: () => Reply | void | Promise<void>;
  };
  deletes: () => string[];
  /** Cualquier petición que no sea GET (POST, PATCH, DELETE). */
  writes: () => string[];
  count: (method: string, pathname: string) => number;
  /** Parámetros de cada `GET /applications`, en orden. */
  listParams: () => Record<string, string>[];
}

export function stubDeleteBackend(initial: Application[]): DeleteBackend {
  const items = [...initial];
  const list = fakeBackend(items);
  const calls: RecordedCall[] = [];
  const handlers: DeleteBackend['handlers'] = {};

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ method, pathname: url.pathname, search: url.search });

    if (url.pathname === '/api/v1/stats' && method === 'GET') {
      const early = await handlers.stats?.();
      if (early) return early;
      const by_status = Object.fromEntries(
        APPLICATION_STATUSES.map((status) => [
          status,
          items.filter((item) => item.status === status).length,
        ]),
      ) as Record<(typeof APPLICATION_STATUSES)[number], number>;
      return jsonResponse(makeStats({ total: items.length, by_status }));
    }
    if (url.pathname === '/api/v1/applications' && method === 'GET') {
      const early = await handlers.list?.(url);
      if (early) return early;
      return list(url, init);
    }
    const match = /^\/api\/v1\/applications\/(\d+)$/.exec(url.pathname);
    if (match && method === 'DELETE') {
      const id = Number(match[1]);
      const remove = () => {
        const index = items.findIndex((item) => item.id === id);
        if (index >= 0) items.splice(index, 1);
      };
      if (handlers.delete) return handlers.delete(id, remove);
      remove();
      return new Response(null, { status: 204 });
    }
    throw new Error(`Petición inesperada: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    items,
    calls,
    handlers,
    deletes: () =>
      calls.filter((call) => call.method === 'DELETE').map((call) => `DELETE ${call.pathname}`),
    writes: () =>
      calls
        .filter((call) => call.method !== 'GET')
        .map((call) => `${call.method} ${call.pathname}`),
    count: (method, pathname) =>
      calls.filter((call) => call.method === method && call.pathname === pathname).length,
    listParams: () =>
      calls
        .filter((call) => call.method === 'GET' && call.pathname === '/api/v1/applications')
        .map((call) => Object.fromEntries(new URLSearchParams(call.search))),
  };
}
