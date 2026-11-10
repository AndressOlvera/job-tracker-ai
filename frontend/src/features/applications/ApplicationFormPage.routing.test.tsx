/**
 * Aceptación de la issue #14: ids raros en la ruta de edición, cambio de ruta sin arrastrar el
 * estado, refrescos en segundo plano, `returnTo` (ADR-013) y que al volver la lista y las
 * estadísticas estén al día con el aviso en la pantalla de destino.
 */
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_LABELS } from '../../api/status';
import type { Application } from '../../api/types';
import { errorResponse, jsonResponse, makeApplication, makeStats } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { fields } from '../../test/formUtils';
import { fakeBackend } from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

async function findForm(name = 'Editar postulación') {
  return screen.findByRole('form', { name });
}

describe('ids raros en /applications/:id/edit', () => {
  it.each([
    'abc',
    '0',
    '-1',
    '1.5',
    '1e3',
    '2%20',
    '%202',
    '%20',
    '01',
    '+1',
    '0x1',
    '1_000',
    'NaN',
    'null',
    'undefined',
    'Infinity',
    '９',
    '٣',
    '9007199254740993',
    '99999999999999999999999',
    '1%2F..%2Fstats',
    '1%2Fedit',
    '..',
    '%2e%2e',
    '1;2',
    '1,2',
    '1%00',
    '%E0%A4%A',
  ])('el id %j no hace ninguna petición y muestra "no encontrada"', (id) => {
    const api = stubFormApi();
    renderWithProviders(`/applications/${id}/edit`);

    expect(screen.getByText('No encontramos esta postulación')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('un id válido muy grande pero seguro (2^53 - 1) sí se pide tal cual', async () => {
    const api = stubFormApi({ get: (id) => jsonResponse(makeApplication({ id })) });
    renderWithProviders('/applications/9007199254740991/edit');

    await findForm();
    expect(api.detailCalls()).toEqual([
      { method: 'GET', path: '/api/v1/applications/9007199254740991', body: undefined },
    ]);
  });

  it('nunca se pide /applications/NaN ni una ruta que no sea un id numérico', async () => {
    const api = stubFormApi();
    const { router } = renderWithProviders('/applications/abc/edit');
    for (const id of ['1e3', '1.5', '-1', '1%2F..%2Fstats']) {
      await act(() => router.navigate(`/applications/${id}/edit`));
    }

    const paths = api.calls.map((call) => call.path);
    expect(paths.filter((path) => /NaN|\.\.|stats|e3|\.5|-1/.test(path))).toEqual([]);
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('el enlace "Volver" y "Ver postulaciones" de un id raro llevan a la lista con sus filtros', () => {
    stubFormApi();
    renderWithProviders({
      pathname: '/applications/abc/edit',
      state: { returnTo: '/?status=offer&q=data' },
    });

    expect(screen.getByRole('link', { name: /Volver a postulaciones/ })).toHaveAttribute(
      'href',
      '/?status=offer&q=data',
    );
    expect(screen.getByRole('link', { name: 'Ver postulaciones' })).toHaveAttribute(
      'href',
      '/?status=offer&q=data',
    );
  });

  it('un 404 de la API con el formato de errores muestra "no encontrada", no "No se pudo cargar"', async () => {
    stubFormApi({ get: () => errorResponse(404, 'not_found', 'No se encontró la postulación.') });
    renderWithProviders('/applications/77/edit');

    expect(await screen.findByText('No encontramos esta postulación')).toBeInTheDocument();
    expect(screen.queryByText('No se pudo cargar la postulación')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('un 500 al cargar muestra el error con Reintentar, que vuelve a pedir y llena el formulario', async () => {
    let attempts = 0;
    const api = stubFormApi({
      get: (id) => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(500, 'internal_error', 'Ocurrió un error inesperado.')
          : jsonResponse(makeApplication({ id }));
      },
    });
    const { user } = renderWithProviders('/applications/42/edit');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocurrió un error inesperado.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    await findForm();
    expect(fields.company()).toHaveValue('Oracle');
    expect(api.detailCalls()).toHaveLength(2);
  });

  it('un 503 sin JSON al cargar muestra el aviso de servicio no disponible', async () => {
    stubFormApi({ get: () => new Response('<html></html>', { status: 503 }) });
    renderWithProviders('/applications/42/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servidor no está disponible en este momento.',
    );
  });
});

describe('cambiar de ruta no conserva el estado del formulario anterior', () => {
  it('de /applications/1/edit a /applications/2/edit: otros datos y nada de lo escrito', async () => {
    stubFormApi({
      get: (id) =>
        jsonResponse(makeApplication({ id, company: `Empresa ${id}`, notes: `Nota ${id}` })),
    });
    const { user, router } = renderWithProviders('/applications/1/edit');
    await findForm();
    await user.clear(fields.company());
    await user.type(fields.company(), 'Escrito a medias');
    await user.type(fields.notes(), ' y más');

    await act(() => router.navigate('/applications/2/edit'));

    await waitFor(() => expect(fields.company()).toHaveValue('Empresa 2'));
    expect(fields.notes()).toHaveValue('Nota 2');
    expect(screen.queryByDisplayValue('Escrito a medias')).not.toBeInTheDocument();
  });

  it('de editar a /applications/new: formulario vacío, estado Postulado y botón de crear', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.selectOptions(fields.status(), 'offer');

    await act(() => router.navigate('/applications/new'));

    expect(await findForm('Nueva postulación')).toBeInTheDocument();
    expect(fields.company()).toHaveValue('');
    expect(fields.status()).toHaveValue('applied');
    expect(fields.notes()).toHaveValue('');
    expect(submitButton()).toHaveTextContent('Guardar postulación');

    // Y guardar manda un POST, no un PATCH.
    await user.type(fields.company(), 'Intel');
    await user.type(fields.position(), 'Dev');
    await user.click(submitButton());
    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('de /applications/new a /applications/new con otro returnTo no pierde lo escrito (misma pantalla)', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Intel');

    await act(() =>
      router.navigate({ pathname: '/applications/new' }, { state: { returnTo: '/?page=2' } }),
    );

    // Es la misma pantalla: conservar el texto es lo esperado; el returnTo nuevo sí aplica.
    expect(fields.company()).toHaveValue('Intel');
    expect(screen.getByRole('link', { name: /Volver a postulaciones/ })).toHaveAttribute(
      'href',
      '/?page=2',
    );
  });

  it('un error 422 de la postulación 1 no se ve en la 2', async () => {
    stubFormApi({
      patch: () =>
        errorResponse(422, 'validation_error', 'x', { company: ['Error de la postulación 1.'] }),
    });
    const { user, router } = renderWithProviders('/applications/1/edit');
    await findForm();
    await user.type(fields.source(), '!');
    await user.click(submitButton());
    await screen.findByText('Error de la postulación 1.');

    await act(() => router.navigate('/applications/2/edit'));
    await waitFor(() => expect(submitButton()).toBeEnabled());

    expect(screen.queryByText('Error de la postulación 1.')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0);
  });

  it('un aviso general o el "No hay cambios" de la postulación 1 no pasa a la 2', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders('/applications/1/edit');
    await findForm();
    await user.click(submitButton());
    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();

    await act(() => router.navigate('/applications/2/edit'));
    await findForm();

    expect(screen.queryByText('No hay cambios que guardar.')).not.toBeInTheDocument();
  });

  it('si el envío de la postulación 1 sigue pendiente, la 2 no queda bloqueada', async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    stubFormApi({ patch: (id) => (id === 1 ? pending : jsonResponse(makeApplication({ id }))) });
    const { user, router } = renderWithProviders('/applications/1/edit');
    await findForm();
    await user.type(fields.source(), '!');
    await user.click(submitButton());
    expect(submitButton()).toHaveTextContent('Guardando…');

    await act(() => router.navigate('/applications/2/edit'));
    await findForm();

    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Guardar cambios');
    release(jsonResponse(makeApplication({ id: 1 })));
  });
});

describe('refrescos en segundo plano mientras se escribe', () => {
  it('el foco de la ventana vuelve a pedir el detalle y no pisa lo escrito', async () => {
    let version = 0;
    const api = stubFormApi({
      get: (id) => {
        version += 1;
        return jsonResponse(
          makeApplication({ id, company: `Oracle v${version}`, source: `S${version}` }),
        );
      },
    });
    const { user } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.clear(fields.source());
    await user.type(fields.source(), 'Mía');

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(api.detailCalls()).toHaveLength(2));
    expect(fields.source()).toHaveValue('Mía');
    expect(fields.company()).toHaveValue('Oracle v1');
  });

  it('un error al refrescar en segundo plano no quita el formulario ni lo escrito', async () => {
    let calls = 0;
    const api = stubFormApi({
      get: (id) => {
        calls += 1;
        return calls === 1
          ? jsonResponse(makeApplication({ id }))
          : errorResponse(500, 'internal_error', 'Ocurrió un error inesperado.');
      },
    });
    const { user, queryClient } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.type(fields.notes(), ' extra');

    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(api.detailCalls()).toHaveLength(2));

    expect(fields.notes()).toHaveValue('Entrevista técnica el viernes extra');
    expect(screen.queryByText('No se pudo cargar la postulación')).not.toBeInTheDocument();
  });

  it('si el servidor cambió un campo que el usuario no tocó, el PATCH no lo pisa', async () => {
    let calls = 0;
    const api = stubFormApi({
      get: (id) => {
        calls += 1;
        return jsonResponse(makeApplication({ id, status: calls === 1 ? 'interview' : 'offer' }));
      },
    });
    const { user, queryClient, router } = renderWithProviders('/applications/42/edit');
    await findForm();
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(api.detailCalls()).toHaveLength(2));
    await user.clear(fields.source());
    await user.type(fields.source(), 'LinkedIn');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ source: 'LinkedIn' });
  });
});

describe('returnTo (ADR-013)', () => {
  const LIST = '/?status=interview&q=data&page=2&sort=company';
  const CASES = [
    ['alta', '/applications/new', 'Guardar postulación'],
    ['edición', '/applications/42/edit', 'Guardar cambios'],
  ] as const;

  describe.each(CASES)('%s', (_name, path) => {
    async function open(state?: unknown) {
      const api = stubFormApi();
      const rendered = renderWithProviders(state === undefined ? path : { pathname: path, state });
      await screen.findByRole('form');
      return { api, ...rendered };
    }

    it('Cancelar vuelve a la lista con TODOS sus filtros', async () => {
      const { user, router } = await open({ returnTo: LIST });
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(router.state.location.search).toBe('?status=interview&q=data&page=2&sort=company');
    });

    it('el enlace "Volver a postulaciones" lleva a la lista con TODOS sus filtros', async () => {
      const { user, router } = await open({ returnTo: LIST });
      await user.click(screen.getByRole('link', { name: /Volver a postulaciones/ }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(router.state.location.search).toBe('?status=interview&q=data&page=2&sort=company');
    });

    it('el éxito vuelve a la lista con TODOS sus filtros', async () => {
      const { user, router } = await open({ returnTo: LIST });
      if (path.endsWith('new')) {
        await user.type(fields.company(), 'Intel');
        await user.type(fields.position(), 'Dev');
      } else {
        await user.type(fields.source(), '!');
      }
      await user.click(submitButton());
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(router.state.location.search).toBe('?status=interview&q=data&page=2&sort=company');
    });

    it('sin state vuelve a / en los tres caminos', async () => {
      const { user, router } = await open();
      expect(screen.getByRole('link', { name: /Volver a postulaciones/ })).toHaveAttribute(
        'href',
        '/',
      );
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(router.state.location.search).toBe('');
    });

    it.each([
      '//evil.com',
      '//evil.com/lista',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\\evil.com',
      '\\\\evil.com',
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'https://evil.com',
      'http://evil.com/?status=offer',
      'evil.com',
      'data:text/html,hola',
      '',
      ' ',
      '?status=offer',
    ])(
      'un returnTo malicioso o inválido (%j) vuelve a / en el enlace y en Cancelar',
      async (returnTo) => {
        const { user, router } = await open({ returnTo });
        expect(screen.getByRole('link', { name: /Volver a postulaciones/ })).toHaveAttribute(
          'href',
          '/',
        );

        await user.click(screen.getByRole('button', { name: 'Cancelar' }));

        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(router.state.location.search).toBe('');
        expect(router.state.location.hash).toBe('');
      },
    );

    it.each([42, null, true, ['/'], { path: '/' }])(
      'un returnTo que no es texto (%j) vuelve a /',
      async (returnTo) => {
        const { user, router } = await open({ returnTo });
        await user.click(screen.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      },
    );

    it.each([null, 'texto', 7, []])('un state raro (%j) vuelve a /', async (state) => {
      const { user, router } = await open(state);
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });

  it('un returnTo malicioso tampoco se usa tras guardar', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '//evil.com' },
    });
    await user.type(fields.company(), 'Intel');
    await user.type(fields.position(), 'Dev');

    await user.click(submitButton());

    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
  });

  it('el returnTo con hash o con caracteres codificados se conserva tal cual', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '/?q=%C3%B1and%C3%BA%20%26%20co&status=offer' },
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?q=%C3%B1and%C3%BA%20%26%20co&status=offer');
  });
});

/** API en memoria con estado: la lista, las estadísticas y los detalles reflejan los cambios. */
function statefulApi(initial: Application[]) {
  const items = [...initial];
  const calls: { method: string; path: string; search: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, search: url.search });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (url.pathname === '/api/v1/stats') {
      return jsonResponse(makeStats({ total: items.length }));
    }
    if (url.pathname === '/api/v1/applications' && method === 'GET') {
      return fakeBackend(items)(url);
    }
    if (url.pathname === '/api/v1/applications' && method === 'POST') {
      const created = makeApplication({ ...body, id: items.length + 100 });
      items.push(created);
      return jsonResponse(created, 201);
    }
    const id = Number(/\/applications\/(\d+)$/.exec(url.pathname)?.[1]);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return errorResponse(404, 'not_found', 'No se encontró la postulación.');
    if (method === 'GET') return jsonResponse(items[index]);
    if (method === 'PATCH') {
      items[index] = { ...items[index], ...body };
      return jsonResponse(items[index]);
    }
    throw new Error(`Petición inesperada: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { items, calls, statsCalls: () => calls.filter((c) => c.path === '/api/v1/stats') };
}

describe('al volver, la lista y las estadísticas están actualizadas y el aviso se ve', () => {
  const seed = () => [
    makeApplication({ id: 1, company: 'Data Corp', position: 'Data Analyst', status: 'applied' }),
    makeApplication({ id: 2, company: 'Otra', position: 'Dev', status: 'applied' }),
  ];

  it('crear: la nueva postulación aparece en la lista filtrada, con "Postulación guardada" y las estadísticas invalidadas', async () => {
    const api = statefulApi(seed());
    const { user, router } = renderWithProviders('/?q=data');
    const table = await screen.findByRole('table', { name: 'Postulaciones' });
    expect(await screen.findByText('2 registradas en total.')).toBeInTheDocument();
    expect(within(table).getByText('Data Corp')).toBeInTheDocument();
    expect(within(table).queryByText('Datadog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '+ Nueva postulación' }));
    await screen.findByRole('form', { name: 'Nueva postulación' });
    await user.type(fields.company(), 'Datadog');
    await user.type(fields.position(), 'Data Engineer');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?q=data');
    expect(await screen.findByText('Postulación guardada')).toBeInTheDocument();
    const updated = await screen.findByRole('table', { name: 'Postulaciones' });
    await waitFor(() => expect(within(updated).getByText('Datadog')).toBeInTheDocument());
    expect(within(updated).getByText('Data Corp')).toBeInTheDocument();
    expect(within(updated).queryByText('Otra')).not.toBeInTheDocument();
    // Las estadísticas se volvieron a pedir: el total del encabezado ya cuenta la nueva.
    expect(await screen.findByText('3 registradas en total.')).toBeInTheDocument();
    expect(api.statsCalls().length).toBeGreaterThanOrEqual(2);
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('editar: el cambio se refleja en la lista, "Cambios guardados" aparece allí y el detalle queda al día', async () => {
    const api = statefulApi(seed());
    const { user, router } = renderWithProviders('/?q=data');
    await screen.findByRole('table', { name: 'Postulaciones' });

    await user.click(screen.getByRole('link', { name: 'Editar la postulación de Data Corp' }));
    await screen.findByRole('form', { name: 'Editar postulación' });
    await user.selectOptions(fields.status(), 'offer');
    await user.clear(fields.company());
    await user.type(fields.company(), 'Data Corp MX');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?q=data');
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Postulaciones' });
    await waitFor(() => expect(within(table).getByText('Data Corp MX')).toBeInTheDocument());
    expect(within(table).getByText(STATUS_LABELS.offer)).toBeInTheDocument();
    expect(within(table).queryByText('Data Corp')).not.toBeInTheDocument();
    expect(api.statsCalls().length).toBeGreaterThanOrEqual(2);

    // Reabrir la edición muestra lo guardado, sin datos viejos del detalle en caché.
    await user.click(screen.getByRole('link', { name: 'Editar la postulación de Data Corp MX' }));
    await screen.findByRole('form', { name: 'Editar postulación' });
    expect(fields.company()).toHaveValue('Data Corp MX');
    expect(fields.status()).toHaveValue('offer');
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  it('sin pasar por la lista antes (desde /applications/new directo) también vuelve a / con el aviso', async () => {
    statefulApi(seed());
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Nueva SA');
    await user.type(fields.position(), 'Dev');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('Postulación guardada')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Postulaciones' });
    expect(within(table).getByText('Nueva SA')).toBeInTheDocument();
  });

  it('el aviso se anuncia en una región role="status" que ya existía antes de guardar', async () => {
    statefulApi(seed());
    const { user, router } = renderWithProviders('/applications/new');
    const regionBefore = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('aria-live') === 'polite' && el.textContent === '');
    expect(regionBefore).toBeDefined();
    await user.type(fields.company(), 'Nueva SA');
    await user.type(fields.position(), 'Dev');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await screen.findByText('Postulación guardada');
    expect(regionBefore).toHaveTextContent('Postulación guardada');
  });
});
