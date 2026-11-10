/**
 * Aceptación de la issue #13: la lista se usa completa con el teclado (sin ratón) y el foco no se
 * pierde. Complementa a `ApplicationsPage.test.tsx`.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication, makeApplicationList } from '../../test/api';
import { useFakeTimers } from '../../test/fakeTimers';
import {
  bodyRows,
  deferred,
  fakeBackend,
  findTable,
  focusedName,
  makeItems,
  stubApi,
} from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SEARCH_DEBOUNCE_MS } from './SearchBox';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Siempre responde con 5 filas, sin importar los filtros. */
function alwaysItems() {
  return jsonResponse(makeApplicationList(makeItems(5)));
}

function sortHeader(name: RegExp) {
  return screen.getByRole('columnheader', { name });
}

function sortButton(name: RegExp) {
  return within(sortHeader(name)).getByRole('button');
}

describe('orden de tabulación', () => {
  it('llega a cada control en el orden visual y salta lo deshabilitado', async () => {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList(
            [
              makeApplication({ id: 1, company: 'Oracle', job_url: 'https://a.com' }),
              makeApplication({ id: 2, company: 'Intel', job_url: null }),
            ],
            { total: 24 },
          ),
        ),
    });
    const { user } = renderWithProviders('/?status=interview');
    await findTable();

    const seen: string[] = [];
    for (let i = 0; i < 23; i++) {
      await user.tab();
      seen.push(focusedName());
    }
    expect(seen).toEqual([
      'Saltar al contenido',
      'Job Tracker',
      'Postulaciones',
      'Estadísticas',
      '+ Nueva postulación',
      'Todas 24',
      'Postulado 15',
      'Entrevista 5',
      'Oferta 1',
      'Rechazado 3',
      'Buscar',
      'Desde',
      'Hasta',
      'Limpiar filtros',
      'Empresa⇅',
      'Estado⇅',
      'Fecha↓',
      'Abrir la vacante de Oracle (se abre en una pestaña nueva)',
      'Editar la postulación de Oracle',
      'Eliminar la postulación de Oracle',
      // Intel no tiene enlace: no hay parada. "Anterior" (deshabilitado) tampoco.
      'Editar la postulación de Intel',
      'Eliminar la postulación de Intel',
      'Siguiente',
    ]);
  });

  it('Shift+Tab recorre el mismo orden al revés', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList(makeItems(2), { total: 24 })) });
    const { user } = renderWithProviders('/');
    await findTable();
    screen.getByRole('button', { name: 'Siguiente' }).focus();
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Eliminar la postulación de Empresa 2');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Editar la postulación de Empresa 2');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Abrir la vacante de Empresa 2 (se abre en una pestaña nueva)');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Eliminar la postulación de Empresa 1');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Editar la postulación de Empresa 1');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Abrir la vacante de Empresa 1 (se abre en una pestaña nueva)');
    await user.tab({ shift: true });
    expect(focusedName()).toBe('Fecha↓');
  });

  it('ningún elemento que recibe el foco está oculto, inerte o deshabilitado', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList(makeItems(3), { total: 24 })) });
    const { user } = renderWithProviders('/?q=a');
    await findTable();
    let stops = 0;
    for (let i = 0; i < 40; i++) {
      await user.tab();
      const active = document.activeElement as HTMLElement;
      if (active === document.body) break; // dio la vuelta al documento
      stops += 1;
      expect(active.closest('[aria-hidden="true"], [inert]')).toBeNull();
      expect(active).not.toBeDisabled();
    }
    expect(stops).toBeGreaterThan(15);
  });
});

describe('encabezados que ordenan', () => {
  it.each([
    ['Enter', '{Enter}'],
    ['Espacio', ' '],
  ])('%s activa el orden, actualiza aria-sort y deja el foco en el encabezado', async (_n, key) => {
    stubApi({ list: fakeBackend(makeItems(5)) });
    const { user, router } = renderWithProviders('/');
    await findTable();

    sortButton(/Empresa/).focus();
    await user.keyboard(key);
    expect(router.state.location.search).toBe('?sort=company');
    expect(sortHeader(/Empresa/)).toHaveAttribute('aria-sort', 'ascending');
    expect(sortHeader(/Fecha/)).toHaveAttribute('aria-sort', 'none');
    expect(sortHeader(/Estado/)).toHaveAttribute('aria-sort', 'none');

    // Cuando llega la lista nueva el foco sigue ahí.
    await waitFor(() =>
      expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'false'),
    );
    expect(sortButton(/Empresa/)).toHaveFocus();

    await user.keyboard(key);
    expect(sortHeader(/Empresa/)).toHaveAttribute('aria-sort', 'descending');
    expect(router.state.location.search).toBe('?sort=-company');
    expect(sortButton(/Empresa/)).toHaveFocus();
  });

  it('aria-sort: exactamente una columna ordenada y solo las ordenables lo declaran', async () => {
    stubApi({ list: fakeBackend(makeItems(5)) });
    renderWithProviders('/?sort=status');
    await findTable();
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader');
    const values = headers.map((header) => header.getAttribute('aria-sort'));
    // Empresa, Puesto, Estado, Fecha, Fuente, Acciones
    expect(values).toEqual(['none', null, 'ascending', 'none', null, null]);
  });

  it.each([
    ['company', 'ascending', 'Empresa'],
    ['-company', 'descending', 'Empresa'],
    ['status', 'ascending', 'Estado'],
    ['-status', 'descending', 'Estado'],
    ['applied_on', 'ascending', 'Fecha'],
    ['-applied_on', 'descending', 'Fecha'],
  ])('?sort=%s marca %s en %s', async (sort, expected, column) => {
    stubApi({ list: fakeBackend(makeItems(3)) });
    renderWithProviders(`/?sort=${sort}`);
    await findTable();
    expect(sortHeader(new RegExp(column))).toHaveAttribute('aria-sort', expected);
  });

  it('con ?sort=created_at (válido en la API, sin columna) ningún encabezado dice estar ordenado', async () => {
    stubApi({ list: fakeBackend(makeItems(3)) });
    renderWithProviders('/?sort=created_at');
    await findTable();
    for (const name of [/Empresa/, /Estado/, /Fecha/]) {
      expect(sortHeader(name)).toHaveAttribute('aria-sort', 'none');
    }
  });

  it('la flecha es decorativa y el nombre del botón es solo el de la columna', async () => {
    stubApi({ list: fakeBackend(makeItems(3)) });
    renderWithProviders('/');
    await findTable();
    expect(within(sortHeader(/Fecha/)).getByRole('button', { name: 'Fecha' })).toBeInTheDocument();
    expect(
      within(sortHeader(/Empresa/)).getByRole('button', { name: 'Empresa' }),
    ).toBeInTheDocument();
  });
});

describe('botones de estado', () => {
  it('Espacio y Enter eligen el estado, cambian aria-pressed y el foco se queda en el botón', async () => {
    stubApi({ list: fakeBackend(makeItems(5)) });
    const { user, router } = renderWithProviders('/');
    await findTable();

    const pressed = () =>
      within(screen.getByRole('group', { name: 'Filtrar por estado' }))
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent?.replace(/\s+\d+$/, '').trim());
    expect(pressed()).toEqual(['Todas']);

    const offer = screen.getByRole('button', { name: /Oferta/ });
    offer.focus();
    await user.keyboard(' ');
    expect(router.state.location.search).toBe('?status=offer');
    expect(pressed()).toEqual(['Oferta']);
    expect(offer).toHaveFocus();

    await user.tab();
    await user.keyboard('{Enter}');
    expect(router.state.location.search).toBe('?status=rejected');
    expect(pressed()).toEqual(['Rechazado']);
    expect(screen.getByRole('button', { name: /Rechazado/ })).toHaveFocus();
  });

  it('pulsar el estado ya activo no navega ni agrega una entrada al historial', async () => {
    stubApi({ list: alwaysItems });
    const { user, router } = renderWithProviders('/?status=offer');
    await findTable();
    const before = router.state.location.key;
    screen.getByRole('button', { name: /Oferta/ }).focus();
    await user.keyboard(' ');
    expect(router.state.location.key).toBe(before);
  });

  it('el foco se queda en el botón cuando el filtro deja la lista vacía', async () => {
    stubApi({
      list: (url) =>
        url.searchParams.get('status') === 'offer'
          ? jsonResponse(makeApplicationList([], { total: 0 }))
          : jsonResponse(makeApplicationList(makeItems(3))),
    });
    const { user } = renderWithProviders('/');
    await findTable();
    const offer = screen.getByRole('button', { name: /Oferta/ });
    offer.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Ninguna postulación coincide con los filtros')).toBeVisible();
    expect(offer).toHaveFocus();
  });
});

describe('búsqueda con teclado', () => {
  it('se puede seguir tecleando mientras la URL cambia y llegan respuestas: nada se pierde', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const slow = deferred<Response>();
    let calls = 0;
    const { listRequests } = stubApi({
      list: () => {
        calls += 1;
        return calls === 2 ? slow.promise : jsonResponse(makeApplicationList(makeItems(3)));
      },
    });
    const { router } = renderWithProviders('/');
    await findTable();
    const input = screen.getByLabelText('Buscar');

    await user.type(input, 'ora');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(router.state.location.search).toBe('?q=ora');
    // La petición de "ora" sigue pendiente; se sigue tecleando con el foco intacto.
    await user.type(input, 'cle');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('oracle');

    // Llega la respuesta de "ora" y el campo no se toca.
    await act(async () => slow.resolve(jsonResponse(makeApplicationList(makeItems(1)))));
    expect(input).toHaveValue('oracle');
    expect(input).toHaveFocus();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(router.state.location.search).toBe('?q=oracle');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'oracle' }));
    expect(input).toHaveValue('oracle');
    expect(input).toHaveFocus();
  });

  it('borrar con Retroceso hasta vaciar quita q de la URL sin perder el foco', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubApi({ list: alwaysItems });
    const { router } = renderWithProviders('/?q=ab');
    await findTable();
    const input = screen.getByLabelText('Buscar');
    await user.click(input);
    await user.keyboard('{Backspace}{Backspace}');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(router.state.location.search).toBe('');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('teclear solo espacios no cambia la URL ni la lista', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { listRequests } = stubApi({ list: fakeBackend(makeItems(3)) });
    const { router } = renderWithProviders('/');
    await findTable();
    await user.type(screen.getByLabelText('Buscar'), '   ');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(router.state.location.search).toBe('');
    expect(listRequests()).toHaveLength(1);
  });

  it('teclear en Buscar estando en la página 3 regresa a la 1', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubApi({ list: alwaysItems });
    const { router } = renderWithProviders('/?page=3&status=offer');
    await findTable();
    await user.type(screen.getByLabelText('Buscar'), 'x');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(router.state.location.search).toBe('?status=offer&q=x');
  });
});

describe('foco tras "Limpiar filtros" y "Ir a la primera página"', () => {
  it('Enter en "Limpiar filtros" (el botón desaparece) deja el foco en Buscar', async () => {
    stubApi({ list: alwaysItems });
    const { user } = renderWithProviders('/?status=offer&q=empresa');
    await findTable();
    const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
    clear.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
    expect(screen.getByLabelText('Buscar')).toHaveFocus();
  });

  it('Espacio en el "Limpiar filtros" del aviso de sin resultados también deja el foco en Buscar', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList([], { total: 0 })) });
    const { user, router } = renderWithProviders('/?q=nada&sort=company');
    await screen.findByText('Ninguna postulación coincide con los filtros');
    const [, inMessage] = screen.getAllByRole('button', { name: 'Limpiar filtros' });
    inMessage.focus();
    await user.keyboard(' ');
    expect(router.state.location.search).toBe('?sort=company');
    expect(screen.getByLabelText('Buscar')).toHaveFocus();
  });

  it('"Ir a la primera página" con el teclado deja el foco en Buscar', async () => {
    stubApi({
      list: (url) =>
        url.searchParams.get('page') === '1'
          ? jsonResponse(makeApplicationList(makeItems(3), { total: 24 }))
          : jsonResponse(makeApplicationList([], { page: 9, total: 24 })),
    });
    const { user } = renderWithProviders('/?page=9');
    const button = await screen.findByRole('button', { name: 'Ir a la primera página' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Buscar')).toHaveFocus();
  });
});

describe('paginación con teclado', () => {
  it('Siguiente / Anterior con Enter recorren las páginas y el foco nunca cae en el vacío', async () => {
    stubApi({
      list: fakeBackend(
        Array.from({ length: 41 }, (_, i) =>
          makeApplication({ id: i + 1, company: `E${i + 1}`, applied_on: '2026-09-01' }),
        ),
      ),
    });
    const { user, router } = renderWithProviders('/');
    await findTable();

    screen.getByRole('button', { name: 'Siguiente' }).focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.search).toBe('?page=2');
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByText('Página 3 de 3')).toBeInTheDocument();
    // Siguiente quedó deshabilitado: el foco pasó a Anterior.
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();

    await user.keyboard(' ');
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();
    await user.keyboard(' ');
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument();
    // Anterior quedó deshabilitado: el foco pasó a Siguiente.
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus();
    expect(router.state.location.search).toBe('');
  });

  it('la paginación es una región de navegación con nombre y su estado se lee', async () => {
    stubApi();
    renderWithProviders('/');
    await findTable();
    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByText('Página 1 de 2')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(bodyRows()).toHaveLength(20);
  });
});

describe('foco cuando la tabla desaparece', () => {
  // Regresión corregida (reportada en la issue #13).
  it('si falla la lista tras ordenar con el teclado, el foco no cae en <body>', async () => {
    stubApi({
      list: (url) =>
        url.searchParams.get('sort') === 'company'
          ? errorResponse(500, 'internal_error', 'Error temporal.')
          : jsonResponse(makeApplicationList(makeItems(3))),
    });
    const { user } = renderWithProviders('/');
    await findTable();
    sortButton(/Empresa/).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('alert');
    expect(document.activeElement).not.toBe(document.body);
  });

  it('el aviso de error tiene role="alert" y un botón Reintentar alcanzable con Tab', async () => {
    stubApi({ list: () => errorResponse(500, 'internal_error', 'Error temporal.') });
    const { user } = renderWithProviders('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error temporal.');
    const seen: string[] = [];
    for (let i = 0; i < 16; i++) {
      await user.tab();
      seen.push(focusedName());
    }
    expect(seen).toContain('Reintentar');
    // Sin tabla, el orden termina en Reintentar y luego vuelve al inicio de la página.
    expect(seen.indexOf('Reintentar')).toBeGreaterThan(seen.indexOf('Hasta'));
  });
});
