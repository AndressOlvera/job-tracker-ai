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
import {
  applicationKeys,
  statsKeys,
  useApplication,
  useApplications,
  useCreateApplication,
  useDeleteApplication,
  useStats,
  useUpdateApplication,
} from './queries';
import type { ApplicationFilters } from './types';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Simula la API: `handler` recibe la URL y el `init` de cada petición. */
function stubApi(handler: Handler) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init = {}) => handler(String(input), init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Peticiones hechas, como `MÉTODO url`, para revisarlas de un vistazo. */
function requestsOf(fetchMock: ReturnType<typeof stubApi>): string[] {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);
}

function renderQueryHook<Result, Props>(
  hook: (props: Props) => Result,
  options: { initialProps?: Props; queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(hook, { wrapper, initialProps: options.initialProps });
  return { ...rendered, queryClient };
}

/** Promesa que la prueba resuelve cuando quiere, para ver qué pasa mientras la API no contesta. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
}

describe('llaves de consulta', () => {
  it('todas las de postulaciones empiezan con `applications`', () => {
    expect(applicationKeys.all).toEqual(['applications']);
    expect(applicationKeys.lists()).toEqual(['applications', 'list']);
    expect(applicationKeys.list({ status: 'offer', page: 2 })).toEqual([
      'applications',
      'list',
      { status: 'offer', page: 2 },
    ]);
    expect(applicationKeys.details()).toEqual(['applications', 'detail']);
    expect(applicationKeys.detail(7)).toEqual(['applications', 'detail', 7]);
    expect(statsKeys.all).toEqual(['stats']);
  });

  it('los filtros vacíos no cambian la llave de la lista', () => {
    expect(applicationKeys.list({ q: '', status: undefined, sort: 'company' })).toEqual(
      applicationKeys.list({ sort: 'company' }),
    );
  });
});

describe('useApplications', () => {
  it('pide la lista con los filtros y devuelve la página', async () => {
    const list = makeApplicationList();
    const fetchMock = stubApi(() => jsonResponse(list));

    const { result } = renderQueryHook(() => useApplications({ status: 'interview', q: 'data' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(list);
    expect(requestsOf(fetchMock)).toEqual(['GET /api/v1/applications?status=interview&q=data']);
  });

  it('conserva la página actual mientras llega la siguiente (sin parpadeo)', async () => {
    const page1 = makeApplicationList([makeApplication({ id: 1 })], { page: 1, total: 21 });
    const page2 = makeApplicationList([makeApplication({ id: 2 })], { page: 2, total: 21 });
    const nextPage = deferred<Response>();
    stubApi((url) => (url.endsWith('page=2') ? nextPage.promise : jsonResponse(page1)));

    const { result, rerender } = renderQueryHook(
      (filters: ApplicationFilters) => useApplications(filters),
      { initialProps: {} },
    );
    await waitFor(() => expect(result.current.data).toEqual(page1));

    rerender({ page: 2 });

    // Mientras tanto se sigue viendo la página 1, marcada como dato provisional.
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);

    await act(async () => nextPage.resolve(jsonResponse(page2)));

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data).toEqual(page2);
  });

  it('cancela la petición anterior al cambiar de filtro', async () => {
    const signals: AbortSignal[] = [];
    stubApi((url, init) => {
      if (init.signal) signals.push(init.signal);
      if (url.endsWith('q=dat')) return new Promise<Response>(() => {});
      return jsonResponse(makeApplicationList());
    });

    const { result, rerender } = renderQueryHook(
      (filters: ApplicationFilters) => useApplications(filters),
      { initialProps: { q: 'dat' } },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ q: 'data' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('un error llega como ApiError, con el mensaje de la API', async () => {
    stubApi(() =>
      errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
        applied_from: ['La fecha inicial no puede ser posterior a la final.'],
      }),
    );

    const { result } = renderQueryHook(() =>
      useApplications({ applied_from: '2026-10-01', applied_to: '2026-09-01' }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 422, code: 'validation_error' });
  });
});

describe('useApplication', () => {
  it('pide una postulación por su id', async () => {
    const application = makeApplication({ id: 7 });
    const fetchMock = stubApi(() => jsonResponse(application));

    const { result } = renderQueryHook(() => useApplication(7));

    await waitFor(() => expect(result.current.data).toEqual(application));
    expect(requestsOf(fetchMock)).toEqual(['GET /api/v1/applications/7']);
  });

  it('sin id (nueva postulación) no hace ninguna petición', () => {
    const fetchMock = stubApi(() => jsonResponse(makeApplication()));

    const { result } = renderQueryHook(() => useApplication(undefined));

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si no existe, el error es un 404', async () => {
    stubApi(() => errorResponse(404, 'not_found', 'La postulación no existe.'));

    const { result } = renderQueryHook(() => useApplication(999));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('useStats', () => {
  it('pide las estadísticas', async () => {
    const stats = makeStats();
    const fetchMock = stubApi(() => jsonResponse(stats));

    const { result } = renderQueryHook(() => useStats());

    await waitFor(() => expect(result.current.data).toEqual(stats));
    expect(requestsOf(fetchMock)).toEqual(['GET /api/v1/stats']);
  });
});

/** Caché con una lista, dos detalles y las estadísticas, como después de usar la app un rato. */
function seededQueryClient(): QueryClient {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(applicationKeys.list({}), makeApplicationList());
  queryClient.setQueryData(applicationKeys.list({ status: 'offer' }), makeApplicationList([]));
  queryClient.setQueryData(applicationKeys.detail(42), makeApplication({ id: 42 }));
  queryClient.setQueryData(applicationKeys.detail(7), makeApplication({ id: 7 }));
  queryClient.setQueryData(statsKeys.all, makeStats());
  return queryClient;
}

describe('useCreateApplication', () => {
  it('crea la postulación e invalida las listas y las estadísticas', async () => {
    const created = makeApplication({ id: 43 });
    const fetchMock = stubApi(() => jsonResponse(created, 201));
    const { result, queryClient } = renderQueryHook(() => useCreateApplication(), {
      queryClient: seededQueryClient(),
    });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({ company: 'Oracle', position: 'Becario' });
    });

    expect(returned).toEqual(created);
    expect(requestsOf(fetchMock)).toEqual(['POST /api/v1/applications']);
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(true);
    expect(isInvalidated(queryClient, applicationKeys.list({ status: 'offer' }))).toBe(true);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(true);
    // Los detalles no cambian al crear otra postulación.
    expect(isInvalidated(queryClient, applicationKeys.detail(42))).toBe(false);
  });

  it('termina cuando la lista en pantalla ya trae la postulación nueva', async () => {
    const before = makeApplicationList([makeApplication({ id: 42 })]);
    const after = makeApplicationList([makeApplication({ id: 43 }), makeApplication({ id: 42 })]);
    let saved = false;
    stubApi(async (_url, init) => {
      if (init.method === 'POST') {
        saved = true;
        return jsonResponse(makeApplication({ id: 43 }), 201);
      }
      if (!saved) return jsonResponse(before);
      // La lista nueva tarda un poco más, para notar si la mutación no la espera.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return jsonResponse(after);
    });
    const { result, queryClient } = renderQueryHook(() => ({
      list: useApplications({}),
      create: useCreateApplication(),
    }));
    await waitFor(() => expect(result.current.list.data).toEqual(before));

    let listWhenDone: unknown;
    await act(async () => {
      await result.current.create.mutateAsync({ company: 'Oracle', position: 'Becario' });
      listWhenDone = queryClient.getQueryData(applicationKeys.list({}));
    });

    // Justo al terminar la mutación, la lista activa ya se volvió a pedir.
    expect(listWhenDone).toEqual(after);
  });

  it('un 422 llega como ApiError con los errores por campo y no invalida nada', async () => {
    const details = { company: ['Este campo es obligatorio.'] };
    stubApi(() =>
      errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', details),
    );
    const { result, queryClient } = renderQueryHook(() => useCreateApplication(), {
      queryClient: seededQueryClient(),
    });

    act(() => result.current.mutate({ company: '', position: 'Becario' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error?.details).toEqual(details);
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(false);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(false);
  });
});

describe('useUpdateApplication', () => {
  it('guarda la respuesta en el detalle e invalida las listas y las estadísticas', async () => {
    const updated = makeApplication({ id: 42, status: 'offer', notes: null });
    const fetchMock = stubApi(() => jsonResponse(updated));
    const { result, queryClient } = renderQueryHook(() => useUpdateApplication(), {
      queryClient: seededQueryClient(),
    });

    await act(() =>
      result.current.mutateAsync({ id: 42, patch: { status: 'offer', notes: null } }),
    );

    expect(requestsOf(fetchMock)).toEqual(['PATCH /api/v1/applications/42']);
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"status":"offer","notes":null}');
    expect(queryClient.getQueryData(applicationKeys.detail(42))).toEqual(updated);
    expect(isInvalidated(queryClient, applicationKeys.detail(42))).toBe(false);
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(true);
    expect(isInvalidated(queryClient, applicationKeys.list({ status: 'offer' }))).toBe(true);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(true);
  });

  it('no vuelve a pedir el detalle que está en pantalla', async () => {
    const original = makeApplication({ id: 42, status: 'applied' });
    const updated = makeApplication({ id: 42, status: 'interview' });
    const fetchMock = stubApi((_url, init) =>
      jsonResponse(init.method === 'PATCH' ? updated : original),
    );
    const { result } = renderQueryHook(() => ({
      detail: useApplication(42),
      update: useUpdateApplication(),
    }));
    await waitFor(() => expect(result.current.detail.data).toEqual(original));

    await act(() => result.current.update.mutateAsync({ id: 42, patch: { status: 'interview' } }));

    await waitFor(() => expect(result.current.detail.data).toEqual(updated));
    expect(requestsOf(fetchMock)).toEqual([
      'GET /api/v1/applications/42',
      'PATCH /api/v1/applications/42',
    ]);
  });
});

describe('useDeleteApplication', () => {
  it('quita el detalle borrado e invalida las listas y las estadísticas', async () => {
    const fetchMock = stubApi(() => new Response(null, { status: 204 }));
    const { result, queryClient } = renderQueryHook(() => useDeleteApplication(), {
      queryClient: seededQueryClient(),
    });

    await act(() => result.current.mutateAsync(42));

    expect(requestsOf(fetchMock)).toEqual(['DELETE /api/v1/applications/42']);
    expect(queryClient.getQueryState(applicationKeys.detail(42))).toBeUndefined();
    expect(queryClient.getQueryData(applicationKeys.detail(7))).toBeDefined();
    expect(isInvalidated(queryClient, applicationKeys.detail(7))).toBe(false);
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(true);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(true);
  });

  it('si la API falla, deja la caché como estaba', async () => {
    stubApi(() => errorResponse(500, 'internal_error', 'Error interno del servidor.'));
    const { result, queryClient } = renderQueryHook(() => useDeleteApplication(), {
      queryClient: seededQueryClient(),
    });

    act(() => result.current.mutate(42));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 500, code: 'internal_error' });
    expect(queryClient.getQueryData(applicationKeys.detail(42))).toBeDefined();
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(false);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(false);
  });

  it('si ya no existe (404), sigue siendo un error pero la lista y las estadísticas se invalidan', async () => {
    stubApi(() => errorResponse(404, 'not_found', 'La postulación no existe.'));
    const { result, queryClient } = renderQueryHook(() => useDeleteApplication(), {
      queryClient: seededQueryClient(),
    });

    act(() => result.current.mutate(42));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 404, code: 'not_found' });
    expect(queryClient.getQueryState(applicationKeys.detail(42))).toBeUndefined();
    expect(queryClient.getQueryData(applicationKeys.detail(7))).toBeDefined();
    expect(isInvalidated(queryClient, applicationKeys.list({}))).toBe(true);
    expect(isInvalidated(queryClient, statsKeys.all)).toBe(true);
  });
});
