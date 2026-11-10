import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '../../api/types';
import {
  errorResponse,
  jsonResponse,
  makeApplication,
  makeApplicationList,
  makeStats,
} from '../../test/api';
import { useFakeTimers } from '../../test/fakeTimers';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SEARCH_DEBOUNCE_MS } from './SearchBox';

type Handler = (url: URL) => Response | Promise<Response>;

function makeItems(count: number, firstId = 1): Application[] {
  return Array.from({ length: count }, (_, index) =>
    makeApplication({
      id: firstId + index,
      company: `Empresa ${firstId + index}`,
      position: `Puesto ${firstId + index}`,
    }),
  );
}

/** 24 postulaciones en 2 páginas de 20, como el boceto de docs/04-pantallas.md. */
function pagedList(url: URL): Response {
  const page = Number(url.searchParams.get('page') ?? 1);
  const items = page === 1 ? makeItems(20) : page === 2 ? makeItems(4, 21) : [];
  return jsonResponse(makeApplicationList(items, { page, total: 24 }));
}

/** Simula la API con `fetch`. Cada prueba decide qué responde la lista y las estadísticas. */
function stubApi({ list = pagedList, stats }: { list?: Handler; stats?: Handler } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/v1/stats') return stats ? stats(url) : jsonResponse(makeStats());
    if (url.pathname === '/api/v1/applications') return list(url);
    throw new Error(`Petición inesperada: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  /** Parámetros de cada petición a la lista, en orden. */
  function listRequests() {
    return fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => url.pathname === '/api/v1/applications')
      .map((url) => Object.fromEntries(url.searchParams));
  }
  return { fetchMock, listRequests };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function findTable() {
  return screen.findByRole('table', { name: 'Postulaciones' });
}

function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

function currentSearch(router: ReturnType<typeof renderWithProviders>['router']) {
  return router.state.location.search;
}

beforeEach(() => {
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  // Las pruebas de la búsqueda usan temporizadores falsos; las demás no deben heredarlos.
  vi.useRealTimers();
});

describe('ApplicationsPage', () => {
  describe('contenido', () => {
    it('muestra el encabezado, el total, la tabla y el resumen de resultados', async () => {
      stubApi();
      renderWithProviders('/');

      expect(screen.getByRole('heading', { level: 1, name: 'Postulaciones' })).toBeInTheDocument();
      await findTable();
      expect(bodyRows()).toHaveLength(20);
      expect(screen.getByText('24 registradas en total.')).toBeInTheDocument();
      expect(screen.getByText('Mostrando 1–20 de 24')).toBeInTheDocument();
      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
      expect(within(bodyRows()[0]).getByText('Empresa 1')).toBeInTheDocument();
    });

    it('el botón "+ Nueva postulación" lleva al formulario', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      expect(screen.getByRole('link', { name: '+ Nueva postulación' })).toHaveAttribute(
        'href',
        '/applications/new',
      );
    });

    it('los botones de estado muestran los conteos de /stats, no los de la página', async () => {
      stubApi();
      renderWithProviders('/');
      expect(await screen.findByRole('button', { name: 'Todas 24' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Postulado 15' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Entrevista 5' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oferta 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rechazado 3' })).toBeInTheDocument();
    });

    it('con una sola postulación el total va en singular', async () => {
      stubApi({
        stats: () =>
          jsonResponse(
            makeStats({
              total: 1,
              by_status: { applied: 1, interview: 0, offer: 0, rejected: 0 },
            }),
          ),
      });
      renderWithProviders('/');
      expect(await screen.findByText('1 registrada en total.')).toBeInTheDocument();
    });

    it('si /stats falla no muestra números inventados: omite el total y los conteos', async () => {
      stubApi({ stats: () => errorResponse(500, 'internal_error', 'Error interno.') });
      const { queryClient } = renderWithProviders('/');
      await findTable();
      await waitFor(() => expect(queryClient.getQueryState(['stats'])?.status).toBe('error'));

      expect(screen.queryByText(/registradas? en total/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oferta' })).toBeInTheDocument();
      // La lista sigue funcionando.
      expect(bodyRows()).toHaveLength(20);
    });

    it('anuncia el resultado en una región aria-live cuando llega la lista', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      const announcement = screen.getByText('Mostrando 1–20 de 24. Página 1 de 2.');
      expect(announcement).toHaveAttribute('aria-live', 'polite');
    });

    it('los campos tienen etiqueta visible', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      expect(screen.getByLabelText('Buscar')).toHaveAttribute('placeholder', 'Empresa o puesto');
      expect(screen.getByLabelText('Desde')).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText('Hasta')).toHaveAttribute('type', 'date');
    });
  });

  describe('filtros en la URL (ADR-013)', () => {
    it('sin filtros pide la primera página con el orden por defecto', async () => {
      const { listRequests } = stubApi();
      renderWithProviders('/');
      await findTable();
      expect(listRequests()).toEqual([{ sort: '-applied_on', page: '1', per_page: '20' }]);
    });

    it('empezar en /?status=interview&q=data&page=2 manda esos parámetros a la API', async () => {
      const { listRequests } = stubApi();
      renderWithProviders('/?status=interview&q=data&page=2');
      await findTable();

      expect(listRequests()[0]).toEqual({
        status: 'interview',
        q: 'data',
        sort: '-applied_on',
        page: '2',
        per_page: '20',
      });
      // Y los controles muestran lo mismo que la URL.
      expect(screen.getByRole('button', { name: /Entrevista/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByLabelText('Buscar')).toHaveValue('data');
      expect(screen.getByText('Mostrando 21–24 de 24')).toBeInTheDocument();
      expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    });

    it('lee las fechas y el orden de la URL', async () => {
      const { listRequests } = stubApi();
      renderWithProviders('/?applied_from=2026-09-01&applied_to=2026-09-30&sort=company');
      await findTable();
      expect(listRequests()[0]).toMatchObject({
        applied_from: '2026-09-01',
        applied_to: '2026-09-30',
        sort: 'company',
      });
      expect(screen.getByLabelText('Desde')).toHaveValue('2026-09-01');
      expect(screen.getByLabelText('Hasta')).toHaveValue('2026-09-30');
      expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
    });

    it('una URL hecha a mano con basura se ignora y no rompe la pantalla', async () => {
      const { listRequests } = stubApi();
      renderWithProviders(
        '/?status=contratado&page=-3&sort=drop_table&applied_from=2026-02-31&q=%20%20&per_page=500',
      );
      await findTable();
      expect(listRequests()).toEqual([{ sort: '-applied_on', page: '1', per_page: '20' }]);
      expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });

    it('un rango de fechas al revés se ignora completo', async () => {
      const { listRequests } = stubApi();
      renderWithProviders('/?applied_from=2026-10-01&applied_to=2026-09-01');
      await findTable();
      expect(listRequests()[0]).not.toHaveProperty('applied_from');
      expect(listRequests()[0]).not.toHaveProperty('applied_to');
      expect(screen.getByLabelText('Desde')).toHaveValue('');
    });

    it('un clic en un estado cambia la URL y regresa a la página 1', async () => {
      const { listRequests } = stubApi();
      const { user, router } = renderWithProviders('/?page=2&q=data');
      await findTable();

      await user.click(screen.getByRole('button', { name: /Oferta/ }));

      expect(currentSearch(router)).toBe('?status=offer&q=data');
      expect(router.state.historyAction).toBe('PUSH');
      expect(screen.getByRole('button', { name: /Oferta/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await waitFor(() =>
        expect(listRequests().at(-1)).toMatchObject({ status: 'offer', q: 'data', page: '1' }),
      );
    });

    it('"Todas" quita el estado y deja la URL limpia', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?status=offer');
      await findTable();
      await user.click(screen.getByRole('button', { name: /Todas/ }));
      expect(currentSearch(router)).toBe('');
    });

    it('volver con atrás recupera el filtro anterior', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/');
      await findTable();
      await user.click(screen.getByRole('button', { name: /Rechazado/ }));
      expect(currentSearch(router)).toBe('?status=rejected');

      await act(() => router.navigate(-1));
      expect(currentSearch(router)).toBe('');
      expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('elegir las fechas las escribe en la URL', async () => {
      const { listRequests } = stubApi();
      const { router } = renderWithProviders('/?page=2');
      await findTable();

      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
      expect(currentSearch(router)).toBe('?applied_from=2026-09-01');
      fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
      expect(currentSearch(router)).toBe('?applied_from=2026-09-01&applied_to=2026-09-30');

      await waitFor(() =>
        expect(listRequests().at(-1)).toMatchObject({
          applied_from: '2026-09-01',
          applied_to: '2026-09-30',
          page: '1',
        }),
      );
    });

    it('un "Desde" posterior al "Hasta" conserva el recién elegido y quita el otro', async () => {
      stubApi();
      const { router } = renderWithProviders('/?applied_from=2026-09-01&applied_to=2026-09-30');
      await findTable();
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-15' } });
      expect(currentSearch(router)).toBe('?applied_from=2026-10-15');
      expect(screen.getByLabelText('Hasta')).toHaveValue('');
    });

    it('vaciar una fecha quita el filtro', async () => {
      stubApi();
      const { router } = renderWithProviders('/?applied_from=2026-09-01');
      await findTable();
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } });
      expect(currentSearch(router)).toBe('');
    });
  });

  describe('búsqueda', () => {
    it('se aplica 300 ms después de dejar de escribir y reemplaza la entrada del historial', async () => {
      useFakeTimers();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { listRequests } = stubApi();
      const { router } = renderWithProviders('/?page=2');
      await findTable();

      await user.type(screen.getByLabelText('Buscar'), 'data');
      // Nada cambia mientras se escribe.
      expect(currentSearch(router)).toBe('?page=2');

      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
      expect(currentSearch(router)).toBe('?page=2');
      act(() => vi.advanceTimersByTime(1));

      expect(currentSearch(router)).toBe('?q=data');
      expect(router.state.historyAction).toBe('REPLACE');
      await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'data', page: '1' }));
    });

    it('el campo sigue editable y conserva texto y foco mientras la lista se actualiza', async () => {
      useFakeTimers();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { listRequests } = stubApi();
      const { router } = renderWithProviders('/');
      await findTable();
      const input = screen.getByLabelText('Buscar');

      await user.type(input, 'da');
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
      expect(currentSearch(router)).toBe('?q=da');
      // La URL ya cambió y la lista se está pidiendo: el usuario sigue escribiendo.
      await user.type(input, 'ta');
      expect(input).toHaveFocus();
      expect(input).toHaveValue('data');

      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
      expect(currentSearch(router)).toBe('?q=data');
      await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'data' }));
      expect(input).toHaveValue('data');
      expect(input).toHaveFocus();
    });

    it('no pasa de 100 caracteres', async () => {
      stubApi();
      const { user } = renderWithProviders('/');
      await findTable();
      const input = screen.getByLabelText('Buscar');
      await user.click(input);
      await user.paste('x'.repeat(150));
      expect(input).toHaveValue('x'.repeat(100));
    });

    it('el campo se sincroniza cuando la URL cambia con atrás', async () => {
      stubApi();
      const { router } = renderWithProviders('/?q=oracle');
      await findTable();
      expect(screen.getByLabelText('Buscar')).toHaveValue('oracle');

      await act(() => router.navigate('/?q=intel'));
      expect(screen.getByLabelText('Buscar')).toHaveValue('intel');
      await act(() => router.navigate(-1));
      expect(screen.getByLabelText('Buscar')).toHaveValue('oracle');
    });
  });

  describe('Limpiar filtros', () => {
    it('no aparece si no hay filtros, aunque haya orden o página', async () => {
      stubApi();
      renderWithProviders('/?sort=company&page=2');
      await findTable();
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
    });

    it.each([
      ['un estado', '/?status=offer'],
      ['una búsqueda', '/?q=data'],
      ['una fecha "desde"', '/?applied_from=2026-09-01'],
      ['una fecha "hasta"', '/?applied_to=2026-09-01'],
    ])('aparece con %s', async (_name, route) => {
      stubApi();
      renderWithProviders(route);
      await findTable();
      expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
    });

    it('quita los filtros, conserva el orden, vacía el campo y deja el foco en la búsqueda', async () => {
      stubApi();
      const { user, router } = renderWithProviders(
        '/?status=offer&q=data&applied_from=2026-09-01&sort=-company&page=2',
      );
      await findTable();

      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

      expect(currentSearch(router)).toBe('?sort=-company');
      expect(screen.getByLabelText('Buscar')).toHaveValue('');
      expect(screen.getByLabelText('Desde')).toHaveValue('');
      expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Buscar')).toHaveFocus();
    });
  });

  describe('orden', () => {
    it('por defecto la Fecha va descendente y las demás sin orden', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      expect(screen.getByRole('columnheader', { name: /Fecha/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
        'aria-sort',
        'none',
      );
    });

    it('Empresa: primero ascendente, luego descendente', async () => {
      const { listRequests } = stubApi();
      const { user, router } = renderWithProviders('/');
      await findTable();

      await user.click(screen.getByRole('button', { name: 'Empresa' }));
      expect(currentSearch(router)).toBe('?sort=company');
      expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ sort: 'company' }));

      await user.click(screen.getByRole('button', { name: 'Empresa' }));
      expect(currentSearch(router)).toBe('?sort=-company');
      expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
    });

    it('Estado empieza ascendente y Fecha, al cambiar de columna, descendente', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/');
      await findTable();

      await user.click(screen.getByRole('button', { name: 'Estado' }));
      expect(currentSearch(router)).toBe('?sort=status');

      await user.click(screen.getByRole('button', { name: 'Fecha' }));
      // Descendente es el orden por defecto: no se escribe en la URL.
      expect(currentSearch(router)).toBe('');
      expect(screen.getByRole('columnheader', { name: /Fecha/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      );

      await user.click(screen.getByRole('button', { name: 'Fecha' }));
      expect(currentSearch(router)).toBe('?sort=applied_on');
    });

    it('cambiar el orden regresa a la página 1 y conserva los filtros', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?status=applied&page=2');
      await findTable();
      await user.click(screen.getByRole('button', { name: 'Empresa' }));
      expect(currentSearch(router)).toBe('?status=applied&sort=company');
    });
  });

  describe('paginación', () => {
    it('en la primera página Anterior está deshabilitado', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    });

    it('Siguiente cambia solo la página, pide la nueva y lleva al inicio de la tabla', async () => {
      const { listRequests } = stubApi();
      const { user, router } = renderWithProviders('/?status=applied&q=data');
      await findTable();

      await user.click(screen.getByRole('button', { name: 'Siguiente' }));

      expect(currentSearch(router)).toBe('?status=applied&q=data&page=2');
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ page: '2' }));
      expect(await screen.findByText('Mostrando 21–24 de 24')).toBeInTheDocument();
      expect(bodyRows()).toHaveLength(4);
      // En la última página, Siguiente se deshabilita y el foco pasa a Anterior.
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();
      expect(await screen.findByText('Mostrando 21–24 de 24. Página 2 de 2.')).toBeInTheDocument();
    });

    it('Anterior regresa a la página 1 y la deja fuera de la URL', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?page=2');
      await findTable();
      await user.click(screen.getByRole('button', { name: 'Anterior' }));
      expect(currentSearch(router)).toBe('');
    });

    it('no se muestra con una sola página', async () => {
      stubApi({ list: () => jsonResponse(makeApplicationList(makeItems(3))) });
      renderWithProviders('/');
      await findTable();
      expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
      expect(screen.getByText('Mostrando 1–3 de 3')).toBeInTheDocument();
    });

    it('con una página fuera de rango explica qué pasó y ofrece volver a la primera', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?page=9');
      expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ir a la primera página' }));
      expect(currentSearch(router)).toBe('');
      expect(await findTable()).toBeInTheDocument();
    });
  });

  describe('estados especiales', () => {
    it('la primera carga muestra un esqueleto accesible en lugar de la tabla', async () => {
      stubApi({ list: () => new Promise<Response>(() => {}) });
      const { container } = renderWithProviders('/');

      // Hay más de una región de estado en la app (la de los avisos), por eso se busca por texto.
      expect(await screen.findByText('Cargando postulaciones…')).toHaveAttribute('role', 'status');
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
      // Los filtros ya se pueden usar.
      expect(screen.getByLabelText('Buscar')).toBeEnabled();
    });

    it('al cambiar de filtro la lista actual sigue visible, atenuada, hasta que llega la nueva', async () => {
      const second = deferred<Response>();
      let calls = 0;
      stubApi({
        list: () => {
          calls += 1;
          return calls === 1 ? jsonResponse(makeApplicationList(makeItems(3))) : second.promise;
        },
      });
      const { user } = renderWithProviders('/');
      await findTable();

      await user.click(screen.getByRole('button', { name: /Oferta/ }));

      // La petición nueva sigue pendiente: se ven las filas de antes, no un esqueleto.
      await waitFor(() => expect(calls).toBe(2));
      expect(bodyRows()).toHaveLength(3);
      expect(screen.getByText('Empresa 1')).toBeInTheDocument();
      expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText('Cargando postulaciones…')).not.toBeInTheDocument();

      second.resolve(
        jsonResponse(makeApplicationList([makeApplication({ id: 99, company: 'Nueva Empresa' })])),
      );
      expect(await screen.findByText('Nueva Empresa')).toBeInTheDocument();
      expect(screen.queryByText('Empresa 1')).not.toBeInTheDocument();
      expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'false');
    });

    it('sin postulaciones: invita a registrar la primera', async () => {
      stubApi({
        list: () => jsonResponse(makeApplicationList([])),
        stats: () =>
          jsonResponse(
            makeStats({
              total: 0,
              by_status: { applied: 0, interview: 0, offer: 0, rejected: 0 },
              by_month: [],
            }),
          ),
      });
      renderWithProviders('/');

      expect(await screen.findByText('Aún no registras postulaciones')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Registrar la primera' })).toHaveAttribute(
        'href',
        '/applications/new',
      );
      expect(screen.getByText('0 registradas en total.')).toBeInTheDocument();
      expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/Ninguna postulación coincide/)).not.toBeInTheDocument();
    });

    it('filtros sin resultados: lo distingue de "sin postulaciones" y ofrece limpiar', async () => {
      const { listRequests } = stubApi({
        list: (url) =>
          jsonResponse(
            url.searchParams.has('q') ? makeApplicationList([]) : makeApplicationList(makeItems(3)),
          ),
      });
      const { user, router } = renderWithProviders('/?q=zzz&sort=company');

      expect(
        await screen.findByText('Ninguna postulación coincide con los filtros'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Aún no registras postulaciones')).not.toBeInTheDocument();
      expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();

      // Hay dos botones iguales: el de la barra de filtros y el del mensaje.
      const buttons = screen.getAllByRole('button', { name: 'Limpiar filtros' });
      expect(buttons).toHaveLength(2);
      await user.click(buttons[1]);

      expect(currentSearch(router)).toBe('?sort=company');
      expect(await findTable()).toBeInTheDocument();
      expect(listRequests().at(-1)).not.toHaveProperty('q');
    });

    it('error de la API: muestra su mensaje en un alert y Reintentar vuelve a pedir la lista', async () => {
      let calls = 0;
      const { listRequests } = stubApi({
        list: () => {
          calls += 1;
          return calls === 1
            ? errorResponse(500, 'internal_error', 'Ocurrió un error inesperado en el servidor.')
            : jsonResponse(makeApplicationList(makeItems(2)));
        },
      });
      const { user } = renderWithProviders('/?status=offer');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No se pudieron cargar las postulaciones');
      expect(alert).toHaveTextContent('Ocurrió un error inesperado en el servidor.');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();

      await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

      expect(await findTable()).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(listRequests()).toHaveLength(2);
      // Reintentó los mismos filtros.
      expect(listRequests()[1]).toEqual(listRequests()[0]);
    });

    it('un error de red muestra el mensaje en español del cliente', async () => {
      stubApi({
        list: () => {
          throw new TypeError('Failed to fetch');
        },
      });
      renderWithProviders('/');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo conectar con el servidor',
      );
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });

    it('si falla una actualización pero ya había datos, conserva la tabla y avisa', async () => {
      let fail = false;
      stubApi({
        list: () =>
          fail
            ? errorResponse(500, 'internal_error', 'No se pudo actualizar.')
            : jsonResponse(makeApplicationList(makeItems(3))),
      });
      const { queryClient } = renderWithProviders('/');
      await findTable();

      fail = true;
      await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar.');
      expect(bodyRows()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });
  });

  describe('acciones de cada fila', () => {
    it('editar guarda la URL de la lista para volver con los mismos filtros', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?status=interview&page=2');
      await findTable();

      await user.click(screen.getByRole('link', { name: 'Editar la postulación de Empresa 21' }));

      expect(router.state.location.pathname).toBe('/applications/21/edit');
      expect(router.state.location.state).toEqual({ returnTo: '/?status=interview&page=2' });
    });

    it('"+ Nueva postulación" también guarda la URL de la lista', async () => {
      stubApi();
      const { user, router } = renderWithProviders('/?q=data');
      await findTable();
      await user.click(screen.getByRole('link', { name: '+ Nueva postulación' }));
      expect(router.state.location.pathname).toBe('/applications/new');
      expect(router.state.location.state).toEqual({ returnTo: '/?q=data' });
    });

    it('el enlace a la vacante se abre en una pestaña nueva y no aparece sin job_url', async () => {
      stubApi({
        list: () =>
          jsonResponse(
            makeApplicationList([
              makeApplication({ id: 1, company: 'Oracle', job_url: 'https://occ.com.mx/1' }),
              makeApplication({ id: 2, company: 'Intel', job_url: null }),
            ]),
          ),
      });
      renderWithProviders('/');
      await findTable();

      const link = screen.getByRole('link', {
        name: 'Abrir la vacante de Oracle (se abre en una pestaña nueva)',
      });
      expect(link).toHaveAttribute('href', 'https://occ.com.mx/1');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.queryByRole('link', { name: /Abrir la vacante de Intel/ })).toBeNull();
    });

    it('eliminar está habilitado y tiene su nombre accesible', async () => {
      stubApi();
      renderWithProviders('/');
      await findTable();
      expect(
        screen.getByRole('button', { name: 'Eliminar la postulación de Empresa 1' }),
      ).toBeEnabled();
    });

    it('la fecha se ve dd/mm/aaaa sin perder un día', async () => {
      stubApi({
        list: () =>
          jsonResponse(
            makeApplicationList([
              makeApplication({ id: 1, applied_on: '2026-09-01' }),
              makeApplication({ id: 2, applied_on: '2026-01-01' }),
            ]),
          ),
      });
      renderWithProviders('/');
      await findTable();
      expect(screen.getByText('01/09/2026')).toBeInTheDocument();
      expect(screen.getByText('01/01/2026')).toBeInTheDocument();
    });
  });
});
