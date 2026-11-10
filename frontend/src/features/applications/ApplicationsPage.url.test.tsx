/**
 * Aceptación de la issue #13: URLs hechas a mano (ADR-013), recarga, atrás/adelante y carrera de
 * respuestas (ADR-012). Complementa a `ApplicationsPage.test.tsx`.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication, makeApplicationList } from '../../test/api';
import { useFakeTimers } from '../../test/fakeTimers';
import {
  bodyRows,
  deferred,
  findTable,
  makeItems,
  stubApi,
  type Handler,
} from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';
import { MAX_QUERY_LENGTH } from './filters';
import { SEARCH_DEBOUNCE_MS } from './SearchBox';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

const ALLOWED_PARAMS = new Set([
  'status',
  'q',
  'applied_from',
  'applied_to',
  'sort',
  'page',
  'per_page',
]);

describe('ADR-013: URLs hechas a mano', () => {
  it('la URL de basura del spec no rompe la pantalla y la API recibe solo lo válido', async () => {
    const { listUrls } = stubApi();
    renderWithProviders('/?status=hired&page=-3&applied_from=2026-02-31&sort=zzz&q=%00');
    expect(await findTable()).toBeInTheDocument();

    const params = listUrls()[0].searchParams;
    expect(params.get('status')).toBeNull();
    expect(params.get('applied_from')).toBeNull();
    expect(params.get('sort')).toBe('-applied_on');
    expect(params.get('page')).toBe('1');
    expect(params.get('per_page')).toBe('20');
  });

  // Regresión corregida (reportada en la issue #13).
  it('un carácter de control (NUL) en q no se manda a la API', async () => {
    const { listUrls } = stubApi();
    renderWithProviders('/?q=%00');
    await findTable();
    expect(listUrls()[0].searchParams.get('q')).toBeNull();
  });

  it.each([
    ['1e3', '1'],
    ['1.5', '1'],
    ['0', '1'],
    ['-3', '1'],
    ['abc', '1'],
    ['%202', '1'],
    ['0x10', '1'],
    ['%D9%A3', '1'], // dígito arábigo "٣"
    ['3', '3'],
    ['007', '7'],
  ])('?page=%s se manda como page=%s', async (raw, expected) => {
    const { listRequests } = stubApi({
      list: () => jsonResponse(makeApplicationList(makeItems(3), { total: 400 })),
    });
    renderWithProviders(`/?page=${raw}`);
    await findTable();
    expect(listRequests()[0].page).toBe(expected);
  });

  it('?status repetido: gana el primero y la API recibe un solo status', async () => {
    const { listUrls } = stubApi();
    renderWithProviders('/?status=interview&status=offer');
    await findTable();
    expect(listUrls()[0].searchParams.getAll('status')).toEqual(['interview']);
    expect(screen.getByRole('button', { name: /Entrevista/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Oferta/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it.each(['INTERVIEW', 'Interview', 'interview%20', '', 'entrevista', '__proto__'])(
    '?status=%s (no es exactamente un estado) se ignora',
    async (raw) => {
      const { listRequests } = stubApi();
      renderWithProviders(`/?status=${raw}`);
      await findTable();
      expect(listRequests()[0]).not.toHaveProperty('status');
      expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
    },
  );

  it.each([
    ['created_at', 'created_at'],
    ['-created_at', '-created_at'],
    ['company%20desc', '-applied_on'],
    ['-Company', '-applied_on'],
    ['company;drop', '-applied_on'],
    ['', '-applied_on'],
  ])('?sort=%s se manda como %s', async (raw, expected) => {
    const { listRequests } = stubApi();
    renderWithProviders(`/?sort=${raw}`);
    await findTable();
    expect(listRequests()[0].sort).toBe(expected);
  });

  it('?q muy larga: se recorta a 100 caracteres en el campo y en la petición', async () => {
    const { listRequests } = stubApi();
    renderWithProviders(`/?q=${'x'.repeat(5000)}`);
    await findTable();
    expect(listRequests()[0].q).toBe('x'.repeat(MAX_QUERY_LENGTH));
    expect(screen.getByLabelText('Buscar')).toHaveValue('x'.repeat(MAX_QUERY_LENGTH));
  });

  it('?q con espacios al inicio y al final se recorta y se muestra recortada', async () => {
    const { listRequests } = stubApi();
    renderWithProviders('/?q=%20%20Oracle%20%20');
    await findTable();
    expect(listRequests()[0].q).toBe('Oracle');
    expect(screen.getByLabelText('Buscar')).toHaveValue('Oracle');
  });

  it('?q con caracteres especiales viaja codificada y se lee igual', async () => {
    const { listUrls } = stubApi();
    renderWithProviders(`/?q=${encodeURIComponent('100% & _ñ <b>')}`);
    await findTable();
    expect(listUrls()[0].searchParams.get('q')).toBe('100% & _ñ <b>');
    expect(screen.getByLabelText('Buscar')).toHaveValue('100% & _ñ <b>');
  });

  // Regresión corregida (reportada en la issue #13).
  it('?q muy larga con emoji no manda un carácter de reemplazo (U+FFFD)', async () => {
    const { listUrls } = stubApi();
    renderWithProviders(`/?q=${encodeURIComponent('a' + '😀'.repeat(60))}`);
    await findTable();
    expect(listUrls()[0].searchParams.get('q')).not.toContain('�');
  });

  it.each([
    ['fechas contradictorias', '/?applied_from=2026-12-31&applied_to=2026-01-01'],
    ['fecha sin ceros', '/?applied_from=2026-1-1'],
    ['fecha con hora', '/?applied_from=2026-01-01T00:00:00Z'],
    ['fecha con barras', '/?applied_from=01/01/2026'],
    ['mes 13', '/?applied_to=2026-13-01'],
    ['30 de febrero', '/?applied_to=2026-02-30'],
    ['29 de febrero de un año no bisiesto', '/?applied_to=2026-02-29'],
    ['texto', '/?applied_from=ayer'],
  ])('%s: no se manda ninguna fecha inválida', async (_name, route) => {
    const { listRequests } = stubApi();
    renderWithProviders(route);
    await findTable();
    const [request] = listRequests();
    expect(request).not.toHaveProperty('applied_from');
    expect(request).not.toHaveProperty('applied_to');
  });

  // Regresión corregida (reportada en la issue #13).
  it('?applied_from=0000-01-01 (año 0, que la API no acepta) no se manda', async () => {
    const { listRequests } = stubApi();
    renderWithProviders('/?applied_from=0000-01-01');
    await findTable();
    expect(listRequests()[0]).not.toHaveProperty('applied_from');
  });

  it('parámetros desconocidos no llegan a la API (ni per_page=500)', async () => {
    const { listUrls } = stubApi();
    renderWithProviders('/?foo=bar&per_page=500&utm_source=x&__proto__=1&status=offer');
    await findTable();
    const keys = [...listUrls()[0].searchParams.keys()];
    expect(keys.filter((key) => !ALLOWED_PARAMS.has(key))).toEqual([]);
    expect(listUrls()[0].searchParams.get('per_page')).toBe('20');
    expect(listUrls()[0].searchParams.get('status')).toBe('offer');
  });

  it('al cambiar un filtro la URL se limpia: sin parámetros desconocidos ni valores por defecto', async () => {
    stubApi();
    const { user, router } = renderWithProviders('/?foo=bar&status=hired&sort=zzz&page=-3');
    await findTable();
    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    expect(router.state.location.search).toBe('?status=interview');
  });

  it('una URL equivalente a la de por defecto no se reescribe sola al cargar', async () => {
    stubApi();
    const { router } = renderWithProviders('/?status=hired&sort=zzz');
    await findTable();
    // Cargar la pantalla no navega: el historial solo tiene la entrada inicial.
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.search).toBe('?status=hired&sort=zzz');
  });

  it('page fuera de rango por URL a mano: explica, conserva los filtros y vuelve a la primera', async () => {
    stubApi({
      list: (url) =>
        url.searchParams.get('page') === '1'
          ? jsonResponse(makeApplicationList(makeItems(3), { total: 24 }))
          : jsonResponse(makeApplicationList([], { page: 9, total: 24 })),
    });
    const { user, router } = renderWithProviders('/?status=interview&page=9');
    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByText('Hay 2 páginas de resultados.')).toBeInTheDocument();
    // No es el mensaje de "sin resultados".
    expect(screen.queryByText('Ninguna postulación coincide con los filtros')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Ir a la primera página' }));
    expect(router.state.location.search).toBe('?status=interview');
    expect(await findTable()).toBeInTheDocument();
  });

  it('página 9 sin ninguna postulación: es "sin postulaciones", no "página inexistente"', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList([], { page: 9, total: 0 })) });
    renderWithProviders('/?page=9');
    expect(await screen.findByText('Aún no registras postulaciones')).toBeInTheDocument();
    expect(screen.queryByText('Esta página no existe')).toBeNull();
  });

  it('página 9 con filtros y 0 resultados: es "sin resultados", no "página inexistente"', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList([], { page: 9, total: 0 })) });
    renderWithProviders('/?page=9&status=offer');
    expect(
      await screen.findByText('Ninguna postulación coincide con los filtros'),
    ).toBeInTheDocument();
  });
});

describe('recarga y atrás/adelante (ADR-013)', () => {
  const URL_WITH_EVERYTHING =
    '/?status=interview&q=data&applied_from=2026-01-01&applied_to=2026-12-31&sort=-company&page=2';

  it('recargar (montar de nuevo con la misma URL) restaura controles y petición', async () => {
    const first = stubApi();
    const { unmount } = renderWithProviders(URL_WITH_EVERYTHING);
    await findTable();
    const firstRequest = first.listRequests()[0];
    unmount();

    const second = stubApi();
    renderWithProviders(URL_WITH_EVERYTHING);
    await findTable();

    expect(second.listRequests()[0]).toEqual(firstRequest);
    expect(firstRequest).toEqual({
      status: 'interview',
      q: 'data',
      applied_from: '2026-01-01',
      applied_to: '2026-12-31',
      sort: '-company',
      page: '2',
      per_page: '20',
    });
    expect(screen.getByRole('button', { name: /Entrevista/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Buscar')).toHaveValue('data');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-12-31');
    expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });

  it('atrás y adelante recorren estado, orden, página y fechas, y los controles los siguen', async () => {
    const { listRequests } = stubApi();
    const { user, router } = renderWithProviders('/');
    await findTable();

    await user.click(screen.getByRole('button', { name: /Entrevista/ })); // push
    await user.click(screen.getByRole('columnheader', { name: /Empresa/ }).firstElementChild!); // push
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-01' } }); // push
    expect(router.state.location.search).toBe(
      '?status=interview&applied_from=2026-03-01&sort=company',
    );

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?status=interview&sort=company');
    expect(screen.getByLabelText('Desde')).toHaveValue('');

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?status=interview');
    expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();

    // Adelante: vuelve a todo.
    await act(() => router.navigate(1));
    await act(() => router.navigate(1));
    await act(() => router.navigate(1));
    expect(router.state.location.search).toBe(
      '?status=interview&applied_from=2026-03-01&sort=company',
    );
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-03-01');
    expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    // Cada navegación pidió la lista que dice su URL (con caché puede no repetirse la petición).
    await waitFor(() =>
      expect(listRequests().at(-1)).toMatchObject({
        status: 'interview',
        applied_from: '2026-03-01',
        sort: 'company',
      }),
    );
  });

  it('la búsqueda reemplaza la entrada del historial: no crea una por letra ni una por búsqueda', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubApi();
    const { router } = renderWithProviders('/');
    await findTable();

    await user.type(screen.getByLabelText('Buscar'), 'oracle');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(router.state.location.search).toBe('?q=oracle');
    // Se reemplazó la entrada inicial: no hay una entrada por letra ni una por la búsqueda.
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.key).not.toBe('default');
  });

  // Regresión corregida (reportada en la issue #13).
  it('atrás descarta lo tecleado y aún no aplicado cuando q no cambia entre entradas', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubApi();
    const { router } = renderWithProviders('/?q=oracle');
    await findTable();
    const input = screen.getByLabelText('Buscar');

    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    expect(router.state.location.search).toBe('?status=offer&q=oracle');

    // Escribe algo sin aplicar (aún dentro de los 300 ms) y navega atrás: gana la URL.
    await user.type(input, 'xyz');
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?q=oracle');
    expect(input).toHaveValue('oracle');
    // El temporizador pendiente no debe aplicar "oraclexyz" después.
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(router.state.location.search).toBe('?q=oracle');
  });

  it('el campo de búsqueda refleja atrás/adelante entre dos búsquedas con el mismo texto de URL', async () => {
    stubApi();
    const { router } = renderWithProviders('/?q=a');
    await findTable();
    await act(() => router.navigate('/?q=b'));
    await act(() => router.navigate('/?q=a'));
    expect(screen.getByLabelText('Buscar')).toHaveValue('a');
    await act(() => router.navigate(-1));
    expect(screen.getByLabelText('Buscar')).toHaveValue('b');
    await act(() => router.navigate(-1));
    expect(screen.getByLabelText('Buscar')).toHaveValue('a');
  });
});

describe('ADR-012: carrera de respuestas', () => {
  /** Una respuesta que se resuelve a mano por cada petición, según su `status`. */
  function controlledApi() {
    const pending: Record<string, ReturnType<typeof deferred<Response>>> = {};
    const signals: Record<string, AbortSignal | null | undefined> = {};
    const list: Handler = (url, init) => {
      const key = url.searchParams.get('status') ?? 'all';
      pending[key] = deferred<Response>();
      signals[key] = init?.signal;
      return pending[key].promise;
    };
    return { pending, signals, list };
  }

  function listOf(company: string) {
    return jsonResponse(
      makeApplicationList([makeApplication({ id: 1, company, position: 'Puesto' })]),
    );
  }

  it('si la respuesta vieja llega después de la nueva, se queda la nueva', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user, router } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(listOf('Inicial'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    await waitFor(() => expect(pending.interview).toBeDefined());
    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(pending.offer).toBeDefined());
    expect(router.state.location.search).toBe('?status=offer');

    // Llega primero la más nueva...
    await act(async () => pending.offer.resolve(listOf('Resp Ofr')));
    expect(await screen.findByText('Resp Ofr')).toBeInTheDocument();

    // ...y después la vieja, que nunca debe pintarse.
    await act(async () => pending.interview.resolve(listOf('Resp Ent')));
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByText('Resp Ent')).toBeNull();
    expect(screen.getByText('Resp Ofr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Oferta/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Entrevista/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('la respuesta vieja que llega mientras la nueva sigue pendiente no se pinta como si fuera la nueva', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(listOf('Inicial'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    await waitFor(() => expect(pending.interview).toBeDefined());
    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(pending.offer).toBeDefined());

    await act(async () => pending.interview.resolve(listOf('Resp Ent')));
    await new Promise((done) => setTimeout(done, 20));
    // La de Oferta sigue en camino: se ve lo último que sí se mostró (Inicial), atenuado, y no la
    // de Entrevista, que ya no es lo que el usuario pidió.
    expect(screen.queryByText('Resp Ent')).toBeNull();
    expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'true');
  });

  it('el resumen anunciado y el resumen visible corresponden a la lista vigente, no a la vieja', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(jsonResponse(makeApplicationList(makeItems(2), { total: 2, pages: 1 })));
    await findTable();
    expect(screen.getByText('Mostrando 1–2 de 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(pending.offer).toBeDefined());
    // Mientras llega la nueva no se anuncia nada nuevo, pero el texto visible no miente sobre la
    // lista que se ve (sigue siendo la anterior).
    expect(screen.getByText('Mostrando 1–2 de 2')).toBeInTheDocument();
    await act(async () =>
      pending.offer.resolve(jsonResponse(makeApplicationList(makeItems(1, 50), { total: 1 }))),
    );
    expect(await screen.findByText('Mostrando 1–1 de 1')).toBeInTheDocument();
    expect(screen.queryByText('Mostrando 1–2 de 2')).toBeNull();
  });

  it('A -> B -> A rápido: gana la última petición aunque la de B llegue al final', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user, router } = renderWithProviders('/?status=interview');
    await waitFor(() => expect(pending.interview).toBeDefined());
    pending.interview.resolve(listOf('Resp A'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Oferta/ })); // B
    await waitFor(() => expect(pending.offer).toBeDefined());
    // A otra vez: ya está en caché y se muestra de inmediato.
    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    expect(router.state.location.search).toBe('?status=interview');
    expect(screen.getByText('Resp A')).toBeInTheDocument();

    await act(async () => pending.offer.resolve(listOf('Resp B')));
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByText('Resp B')).toBeNull();
    expect(screen.getByText('Resp A')).toBeInTheDocument();
  });

  it('atrás mientras una respuesta está en camino: se muestra la URL actual, no la que llega tarde', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user, router } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(listOf('Inicial'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Rechazado/ }));
    await waitFor(() => expect(pending.rejected).toBeDefined());
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');

    await act(async () => pending.rejected.resolve(listOf('Resp Rch')));
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByText('Resp Rch')).toBeNull();
    expect(screen.getByText('Inicial')).toBeInTheDocument();
  });

  it('cancela la petición anterior al cambiar de filtro (la señal se aborta)', async () => {
    const { pending, signals, list } = controlledApi();
    stubApi({ list });
    const { user } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(listOf('Inicial'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    await waitFor(() => expect(pending.interview).toBeDefined());
    expect(signals.interview?.aborted).toBe(false);
    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(signals.interview?.aborted).toBe(true));
    expect(signals.offer?.aborted).toBe(false);
  });

  it('un error de una petición vieja no ensucia la pantalla de la nueva', async () => {
    const { pending, list } = controlledApi();
    stubApi({ list });
    const { user } = renderWithProviders('/');
    await waitFor(() => expect(pending.all).toBeDefined());
    pending.all.resolve(listOf('Inicial'));
    await findTable();

    await user.click(screen.getByRole('button', { name: /Entrevista/ }));
    await waitFor(() => expect(pending.interview).toBeDefined());
    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(pending.offer).toBeDefined());

    await act(async () => pending.offer.resolve(listOf('Resp Ofr')));
    await act(async () =>
      pending.interview.resolve(errorResponse(500, 'internal_error', 'Falló la vieja.')),
    );
    await new Promise((done) => setTimeout(done, 20));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Falló la vieja.')).toBeNull();
    expect(screen.getByText('Resp Ofr')).toBeInTheDocument();
  });
});

describe('errores al cambiar de filtro o de página', () => {
  it('si falla la lista nueva, se muestra el error con Reintentar y la URL conserva el filtro', async () => {
    let failOffer = true;
    stubApi({
      list: (url) =>
        url.searchParams.get('status') === 'offer' && failOffer
          ? errorResponse(500, 'internal_error', 'Error temporal.')
          : jsonResponse(makeApplicationList(makeItems(3))),
    });
    const { user, router } = renderWithProviders('/');
    await findTable();

    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error temporal.');
    expect(router.state.location.search).toBe('?status=offer');
    // Los filtros siguen usables.
    expect(screen.getByRole('button', { name: /Oferta/ })).toHaveAttribute('aria-pressed', 'true');

    failOffer = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(bodyRows()).toHaveLength(3);
  });

  it('desde el error se puede cambiar de filtro y se recupera sin pulsar Reintentar', async () => {
    stubApi({
      list: (url) =>
        url.searchParams.get('status') === 'offer'
          ? errorResponse(500, 'internal_error', 'Error temporal.')
          : jsonResponse(makeApplicationList(makeItems(2))),
    });
    const { user } = renderWithProviders('/?status=offer');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Todas/ }));
    expect(await findTable()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fallo de un refetch con datos previos: la tabla se queda, Reintentar vuelve a pedir y el aviso se va', async () => {
    let fail = false;
    const { listRequests } = stubApi({
      list: () =>
        fail
          ? errorResponse(503, 'internal_error', 'Servicio no disponible.')
          : jsonResponse(makeApplicationList(makeItems(3))),
    });
    const { user, queryClient } = renderWithProviders('/');
    await findTable();

    fail = true;
    await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
    // La paginación y los encabezados siguen disponibles.
    expect(screen.getByRole('columnheader', { name: /Empresa/ })).toBeInTheDocument();

    const before = listRequests().length;
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(listRequests().length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(bodyRows()).toHaveLength(3);
  });
});
