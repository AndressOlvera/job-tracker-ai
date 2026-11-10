/**
 * Issue #15: `useDeleteApplication` y la coherencia de la caché. Solo un `404` (ya la habían
 * borrado) limpia el detalle y refresca; cualquier otro fallo deja la caché intacta, y un detalle
 * abierto en otra pantalla no se vuelve a pedir después de borrarlo.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  errorResponse,
  jsonResponse,
  makeApplication,
  makeApplicationList,
  makeStats,
} from '../test/api';
import { createTestQueryClient } from '../test/renderWithProviders';
import { ApiError } from './client';
import { createQueryClient } from './queryClient';
import {
  applicationKeys,
  statsKeys,
  useApplication,
  useApplications,
  useDeleteApplication,
  useStats,
} from './queries';

type Reply = Response | Promise<Response>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Simula la API: lecturas con datos fijos y `DELETE` con la respuesta que dé `onDelete`. */
function stubApi(onDelete: (id: number) => Reply = () => new Response(null, { status: 204 })) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const detail = /^\/api\/v1\/applications\/(\d+)$/.exec(url.pathname);
    if (method === 'DELETE' && detail) return onDelete(Number(detail[1]));
    if (method === 'GET' && detail) {
      return jsonResponse(makeApplication({ id: Number(detail[1]) }));
    }
    if (url.pathname === '/api/v1/applications') return jsonResponse(makeApplicationList());
    if (url.pathname === '/api/v1/stats') return jsonResponse(makeStats());
    throw new Error(`Petición inesperada: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    requests: () =>
      fetchMock.mock.calls.map(
        ([input, init]) =>
          `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`,
      ),
  };
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Caché con una lista, las estadísticas y los detalles 2 y 3, todos "frescos". */
function seeded(queryClient = createTestQueryClient()) {
  queryClient.setQueryData(applicationKeys.list({}), makeApplicationList());
  queryClient.setQueryData(applicationKeys.list({ status: 'offer' }), makeApplicationList());
  queryClient.setQueryData(statsKeys.all, makeStats());
  queryClient.setQueryData(applicationKeys.detail(2), makeApplication({ id: 2 }));
  queryClient.setQueryData(applicationKeys.detail(3), makeApplication({ id: 3 }));
  return queryClient;
}

const stale = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

describe('useDeleteApplication: fallos que no son 404 no tocan la caché', () => {
  const failures: [string, () => Reply, number | undefined][] = [
    ['500 JSON', () => errorResponse(500, 'internal_error', 'Error interno.'), 500],
    ['503 HTML', () => new Response('<html>503</html>', { status: 503 }), 503],
    ['400', () => errorResponse(400, 'bad_request', 'Identificador inválido.'), 400],
    ['403', () => errorResponse(403, 'forbidden', 'Sin permiso.'), 403],
    ['500 no JSON', () => new Response('boom', { status: 500 }), 500],
    ['red caída', () => Promise.reject(new TypeError('Failed to fetch')), undefined],
  ];

  it.each(failures)(
    '%s: rechaza con ApiError, conserva detalles y no invalida',
    async (_n, reply, status) => {
      const api = stubApi(() => reply());
      const queryClient = seeded();
      const { result } = renderHook(() => useDeleteApplication(), {
        wrapper: wrapperFor(queryClient),
      });

      const outcome = await act(() =>
        result.current.mutateAsync(2).catch((error: unknown) => error),
      );

      expect(outcome).toBeInstanceOf(ApiError);
      expect((outcome as ApiError).status).toBe(status);
      expect(queryClient.getQueryData(applicationKeys.detail(2))).toBeDefined();
      expect(queryClient.getQueryData(applicationKeys.detail(3))).toBeDefined();
      expect(stale(queryClient, applicationKeys.list({}))).toBe(false);
      expect(stale(queryClient, applicationKeys.list({ status: 'offer' }))).toBe(false);
      expect(stale(queryClient, statsKeys.all)).toBe(false);
      expect(api.requests()).toEqual(['DELETE /api/v1/applications/2']);
    },
  );

  it('con el QueryClient real de la app una mutación fallida NO se reintenta (una sola petición)', async () => {
    const api = stubApi(() => errorResponse(500, 'internal_error', 'Error interno.'));
    const queryClient = seeded(createQueryClient());
    const { result } = renderHook(() => useDeleteApplication(), {
      wrapper: wrapperFor(queryClient),
    });

    await act(() => result.current.mutateAsync(2).catch(() => undefined));

    expect(api.requests()).toEqual(['DELETE /api/v1/applications/2']);
  });
});

describe('useDeleteApplication: éxito y 404 dejan la caché coherente', () => {
  it.each([
    ['204', () => new Response(null, { status: 204 })],
    ['404', () => errorResponse(404, 'not_found', 'No existe.')],
  ])(
    'con %s quita solo el detalle borrado e invalida todas las listas y las estadísticas',
    async (_n, reply) => {
      stubApi(() => reply());
      const queryClient = seeded();
      const { result } = renderHook(() => useDeleteApplication(), {
        wrapper: wrapperFor(queryClient),
      });

      await act(() => result.current.mutateAsync(2).catch(() => undefined));

      expect(queryClient.getQueryState(applicationKeys.detail(2))).toBeUndefined();
      expect(queryClient.getQueryData(applicationKeys.detail(3))).toBeDefined();
      expect(stale(queryClient, applicationKeys.detail(3))).toBe(false);
      expect(stale(queryClient, applicationKeys.list({}))).toBe(true);
      expect(stale(queryClient, applicationKeys.list({ status: 'offer' }))).toBe(true);
      expect(stale(queryClient, statsKeys.all)).toBe(true);
    },
  );

  it('con 204, la mutación se resuelve sin esperar la lista ni las estadísticas, que se piden en segundo plano', async () => {
    const api = stubApi();
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => ({ list: useApplications({}), stats: useStats(), remove: useDeleteApplication() }),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() =>
      expect(result.current.list.isSuccess && result.current.stats.isSuccess).toBe(true),
    );
    // A partir de aquí las lecturas no responden hasta que la prueba lo decida.
    const reads = deferred<void>();
    const original = api.fetchMock.getMockImplementation()!;
    api.fetchMock.mockImplementation(async (input, init) => {
      const isRead = (init?.method ?? 'GET') === 'GET';
      if (isRead) await reads.promise;
      return original(input, init);
    });
    const readsBefore = api.requests().length;

    await act(() => result.current.remove.mutateAsync(2));

    // La mutación ya terminó y las lecturas siguen en curso.
    await waitFor(() => expect(result.current.list.isFetching).toBe(true));
    expect(result.current.stats.isFetching).toBe(true);
    expect(result.current.remove.isSuccess).toBe(true);
    reads.resolve();
    await waitFor(() => expect(result.current.list.isFetching).toBe(false));
    await waitFor(() => expect(result.current.stats.isFetching).toBe(false));
    expect(api.requests().slice(readsBefore).sort()).toEqual([
      'DELETE /api/v1/applications/2',
      'GET /api/v1/applications',
      'GET /api/v1/stats',
    ]);
  });

  it('con 204 la lista en caché pierde la fila y la cuenta al instante, y las demás listas quedan intactas', async () => {
    stubApi();
    const queryClient = createTestQueryClient();
    const rows = [makeApplication({ id: 1 }), makeApplication({ id: 2 })];
    queryClient.setQueryData(
      applicationKeys.list({}),
      makeApplicationList(rows, { total: 21, per_page: 20 }),
    );
    const other = makeApplicationList([makeApplication({ id: 3 })], { total: 1 });
    queryClient.setQueryData(applicationKeys.list({ status: 'offer' }), other);
    const { result } = renderHook(() => useDeleteApplication(), {
      wrapper: wrapperFor(queryClient),
    });

    await act(() => result.current.mutateAsync(2));

    const cached = queryClient.getQueryData<ReturnType<typeof makeApplicationList>>(
      applicationKeys.list({}),
    );
    expect(cached?.items.map((item) => item.id)).toEqual([1]);
    expect(cached?.total).toBe(20);
    expect(cached?.pages).toBe(1);
    expect(queryClient.getQueryData(applicationKeys.list({ status: 'offer' }))).toBe(other);
  });

  it('con 404 la lista y las estadísticas en pantalla también se vuelven a pedir', async () => {
    const api = stubApi(() => errorResponse(404, 'not_found', 'No existe.'));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => ({ list: useApplications({}), stats: useStats(), remove: useDeleteApplication() }),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() =>
      expect(result.current.list.isSuccess && result.current.stats.isSuccess).toBe(true),
    );
    const readsBefore = api.requests().length;

    await act(() => result.current.remove.mutateAsync(2).catch(() => undefined));

    expect(api.requests().slice(readsBefore).sort()).toEqual([
      'DELETE /api/v1/applications/2',
      'GET /api/v1/applications',
      'GET /api/v1/stats',
    ]);
  });
});

describe('useDeleteApplication: detalle abierto en otra pantalla', () => {
  async function mountDetail(onDelete?: (id: number) => Reply) {
    const api = stubApi(onDelete);
    const queryClient = createTestQueryClient();
    const view = renderHook(
      () => ({
        detail: useApplication(2),
        other: useApplication(3),
        remove: useDeleteApplication(),
      }),
      { wrapper: wrapperFor(queryClient) },
    );
    await waitFor(() =>
      expect(view.result.current.detail.isSuccess && view.result.current.other.isSuccess).toBe(
        true,
      ),
    );
    return { ...view, api, queryClient };
  }

  // Decisión (issue #15): si una pantalla tiene montado el detalle que se borra, al redibujarse
  // crea la consulta de nuevo y la pide (daría 404); ningún ajuste del hook lo evita, así que quien
  // borra debe salir de esa pantalla (la lista no abre detalles). Lo que sí garantiza el hook es
  // que no pide el detalle borrado cuando nadie lo observa, y que no toca el de otra postulación.
  it.each([
    ['204', () => new Response(null, { status: 204 })],
    ['404', () => errorResponse(404, 'not_found', 'No existe.')],
  ])(
    'con %s quita el detalle borrado sin volver a pedirlo (daría 404) ni tocar el de otra postulación',
    async (_n, reply) => {
      const api = stubApi(() => reply());
      const queryClient = seeded();
      const { result } = renderHook(
        () => ({ other: useApplication(3), remove: useDeleteApplication() }),
        { wrapper: wrapperFor(queryClient) },
      );
      await waitFor(() => expect(result.current.other.isSuccess).toBe(true));
      const before = api.requests().length;

      await act(() => result.current.remove.mutateAsync(2).catch(() => undefined));
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(api.requests().slice(before)).toEqual(['DELETE /api/v1/applications/2']);
      expect(queryClient.getQueryState(applicationKeys.detail(2))).toBeUndefined();
      expect(result.current.other.data?.id).toBe(3);
      expect(stale(queryClient, applicationKeys.detail(3))).toBe(false);
    },
  );

  it('con 500 el detalle abierto sigue como estaba: con datos, sin error y sin pedirlo otra vez', async () => {
    const { result, api, queryClient } = await mountDetail(() =>
      errorResponse(500, 'internal_error', 'Error interno.'),
    );
    const before = api.requests().length;

    await act(() => result.current.remove.mutateAsync(2).catch(() => undefined));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(api.requests().slice(before)).toEqual(['DELETE /api/v1/applications/2']);
    expect(result.current.detail.data?.id).toBe(2);
    expect(result.current.detail.isError).toBe(false);
    expect(stale(queryClient, applicationKeys.detail(2))).toBe(false);
  });

  it('si se vuelve a abrir el detalle ya borrado se pide de nuevo (no queda un dato viejo en caché)', async () => {
    const { result, api, queryClient, unmount } = await mountDetail();
    await act(() => result.current.remove.mutateAsync(2));
    unmount();
    const before = api.requests().length;

    renderHook(() => useApplication(2), { wrapper: wrapperFor(queryClient) });

    await waitFor(() =>
      expect(api.requests().slice(before)).toEqual(['GET /api/v1/applications/2']),
    );
  });
});
