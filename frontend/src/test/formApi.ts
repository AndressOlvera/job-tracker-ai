import { vi } from 'vitest';
import type { Application } from '../api/types';
import { jsonResponse, makeApplication, makeApplicationList, makeStats } from './api';

/**
 * API simulada para las pruebas del formulario: detalle, crear y editar, más la lista y las
 * estadísticas que se piden al volver a la lista. Sin `get`, `post` ni `patch`, responde como
 * la API cuando todo sale bien.
 */

type Reply = Response | Promise<Response>;

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

interface FormApiHandlers {
  get?: (id: number) => Reply;
  post?: (body: Record<string, unknown>) => Reply;
  patch?: (id: number, body: Record<string, unknown>) => Reply;
}

export function stubFormApi({ get, post, patch }: FormApiHandlers = {}) {
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });

    if (url.pathname === '/api/v1/stats') return jsonResponse(makeStats());
    if (url.pathname === '/api/v1/applications' && method === 'GET') {
      return jsonResponse(makeApplicationList([]));
    }
    if (url.pathname === '/api/v1/applications' && method === 'POST') {
      return post
        ? post(body)
        : jsonResponse(makeApplication({ ...(body as Partial<Application>), id: 99 }), 201);
    }
    const id = Number(/^\/api\/v1\/applications\/(\d+)$/.exec(url.pathname)?.[1]);
    if (id && method === 'GET') return get ? get(id) : jsonResponse(makeApplication({ id }));
    if (id && method === 'PATCH') {
      return patch
        ? patch(id, body)
        : jsonResponse(makeApplication({ ...(body as Partial<Application>), id }));
    }
    throw new Error(`Petición inesperada: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  /** Las peticiones de un método (p. ej. `POST`), en orden. */
  function callsTo(method: string, path?: string) {
    return calls.filter((call) => call.method === method && (!path || call.path === path));
  }
  /** Las peticiones al detalle de una postulación (`/applications/{id}`), de cualquier método. */
  function detailCalls() {
    return calls.filter((call) => /^\/api\/v1\/applications\/[^/]+$/.test(call.path));
  }
  return { fetchMock, calls, callsTo, detailCalls };
}
