/**
 * Aceptación de la issue #15 (HU-05): eliminar desde la lista con confirmación. Pide confirmación
 * antes de borrar, hace una sola petición, avisa el resultado y deja el foco en un lugar útil.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../../api/client';
import type { Application } from '../../api/types';
import { errorResponse, jsonResponse, makeApplication, makeStats } from '../../test/api';
import { deferred, fakeBackend, findTable, makeItems, bodyRows } from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  document.body.style.overflow = '';
});

type DeleteHandler = (id: number, remove: () => void) => Response | Promise<Response>;

/** API en memoria con DELETE: por defecto borra y responde 204; cada prueba puede cambiarlo. */
function stubBackend(initial: Application[], onDelete?: DeleteHandler) {
  const items = [...initial];
  const list = fakeBackend(items);
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname === '/api/v1/stats') {
      return jsonResponse(makeStats({ total: items.length }));
    }
    if (url.pathname === '/api/v1/applications' && method === 'GET') return list(url, init);
    const match = /^\/api\/v1\/applications\/(\d+)$/.exec(url.pathname);
    if (match && method === 'DELETE') {
      const id = Number(match[1]);
      const remove = () => {
        const index = items.findIndex((item) => item.id === id);
        if (index >= 0) items.splice(index, 1);
      };
      if (onDelete) return onDelete(id, remove);
      remove();
      return new Response(null, { status: 204 });
    }
    throw new Error(`Petición inesperada: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    items,
    calls,
    deletes: () => calls.filter((call) => call.startsWith('DELETE')),
    count: (call: string) => calls.filter((entry) => entry === call).length,
  };
}

const deleteButton = (company: string) =>
  screen.getByRole('button', { name: `Eliminar la postulación de ${company}` });
const cancelButton = () => screen.getByRole('button', { name: 'Cancelar' });
const confirmButton = () => screen.getByRole('button', { name: 'Eliminar' });
const dialog = () => screen.getByRole('alertdialog');
const heading = () => screen.getByRole('heading', { level: 1, name: 'Postulaciones' });

async function openFor(company: string, route = '/', items = makeItems(3)) {
  const backend = stubBackend(items);
  const view = renderWithProviders(route);
  await findTable();
  await view.user.click(deleteButton(company));
  return { ...view, backend };
}

describe('abrir el diálogo', () => {
  it('muestra la empresa y el puesto de la fila elegida, sin pedir nada a la API', async () => {
    const { backend } = await openFor('Empresa 2');

    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
    expect(dialog()).toHaveAccessibleDescription('Puesto 2. Esta acción no se puede deshacer.');
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(backend.deletes()).toEqual([]);
  });

  it('el foco empieza en Cancelar y el resto de la página queda inerte', async () => {
    await openFor('Empresa 1');

    expect(cancelButton()).toHaveFocus();
    expect(document.getElementById('contenido')?.closest('[inert]')).not.toBeNull();
    expect(dialog().closest('[inert]')).toBeNull();
  });

  it('con el diálogo abierto no se abre otro con otra fila', async () => {
    await openFor('Empresa 1');
    // Con el ratón no se llega (el fondo tapa la lista); aquí se fuerza el evento.
    act(() => deleteButton('Empresa 3').click());

    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 1?');
  });

  it('Tab y Shift+Tab no salen del diálogo', async () => {
    const { user } = await openFor('Empresa 1');

    await user.tab();
    expect(confirmButton()).toHaveFocus();
    await user.tab();
    expect(cancelButton()).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancelButton()).toHaveFocus();
  });

  it('mantiene la postulación elegida aunque la lista se refresque con otros datos', async () => {
    const { backend, queryClient } = await openFor('Empresa 2');
    backend.items[1] = makeApplication({ id: 2, company: 'Otro nombre', position: 'Otro puesto' });

    await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));
    await within(screen.getByRole('table')).findByText('Otro nombre');

    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
    expect(dialog()).toHaveAccessibleDescription('Puesto 2. Esta acción no se puede deshacer.');
  });

  it('muestra una empresa con HTML como texto', async () => {
    const hostile = makeApplication({
      id: 9,
      company: '<img src=x onerror=alert(1)>',
      position: '<b>x</b>',
    });
    stubBackend([hostile]);
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(screen.getByRole('button', { name: /^Eliminar la postulación de/ }));

    expect(dialog().querySelector('img')).toBeNull();
    expect(dialog().querySelector('b')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '¿Eliminar la postulación a <img src=x onerror=alert(1)>?',
    );
  });
});

describe('cancelar', () => {
  it.each([
    [
      'el botón Cancelar',
      async (user: ReturnType<typeof renderWithProviders>['user']) => user.click(cancelButton()),
    ],
    [
      'Esc',
      async (user: ReturnType<typeof renderWithProviders>['user']) => user.keyboard('{Escape}'),
    ],
    [
      'un clic en el fondo',
      async (user: ReturnType<typeof renderWithProviders>['user']) =>
        user.click(dialog().parentElement as HTMLElement),
    ],
  ])('con %s no borra ni hace peticiones, y el foco vuelve al ✕', async (_name, close) => {
    const { user, backend } = await openFor('Empresa 2');
    const before = backend.calls.length;

    await close(user);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(backend.deletes()).toEqual([]);
    expect(backend.calls).toHaveLength(before);
    expect(bodyRows()).toHaveLength(3);
    expect(deleteButton('Empresa 2')).toHaveFocus();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(screen.queryByText('Postulación eliminada')).toBeNull();
  });

  it('se puede abrir otra fila después de cancelar', async () => {
    const { user } = await openFor('Empresa 1');
    await user.keyboard('{Escape}');
    await user.click(deleteButton('Empresa 3'));
    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 3?');
  });

  it('si la fila desapareció mientras el diálogo estaba abierto, el foco va al título', async () => {
    const { user, backend, queryClient } = await openFor('Empresa 2');
    backend.items.splice(1, 1);
    await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));
    await within(screen.getByRole('table')).findByText('Empresa 3');
    expect(screen.queryByRole('button', { name: /Empresa 2/ })).toBeNull();

    await user.click(cancelButton());

    expect(heading()).toHaveFocus();
  });
});

describe('confirmar', () => {
  it('hace un solo DELETE de esa postulación, avisa y actualiza la lista y las estadísticas', async () => {
    const { user, backend } = await openFor('Empresa 2');
    const listBefore = backend.count('GET /api/v1/applications');
    const statsBefore = backend.count('GET /api/v1/stats');
    expect(screen.getByText('3 registradas en total.')).toBeInTheDocument();

    await user.click(confirmButton());

    expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText('Empresa 2')).toBeNull();
    expect(bodyRows()).toHaveLength(2);
    // Una sola recarga de la lista y de las estadísticas, nada más.
    expect(backend.count('GET /api/v1/applications')).toBe(listBefore + 1);
    expect(backend.count('GET /api/v1/stats')).toBe(statsBefore + 1);
    expect(await screen.findByText('2 registradas en total.')).toBeInTheDocument();
    expect(backend.calls.filter((call) => !call.startsWith('GET'))).toEqual([
      'DELETE /api/v1/applications/2',
    ]);
  });

  it('envía el método DELETE sin cuerpo', async () => {
    const { user } = await openFor('Empresa 1');
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    const fetchMock = vi.mocked(fetch);
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(call?.[0]).toBe('/api/v1/applications/1');
    expect(call?.[1]?.body).toBeUndefined();
  });

  it('tras borrar, el foco va al título (la fila ya no existe) y la página es accesible otra vez', async () => {
    const { user } = await openFor('Empresa 2');
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    expect(heading()).toHaveFocus();
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('con teclado: Enter sobre Eliminar confirma', async () => {
    const { user, backend } = await openFor('Empresa 1');
    await user.tab();
    expect(confirmButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByText('Postulación eliminada');
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/1']);
  });

  it('mientras espera: "Eliminando…", todo bloqueado y un segundo clic o Enter no repite la petición', async () => {
    const pending = deferred<Response>();
    const backend = stubBackend(makeItems(3), () => pending.promise);
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));

    await user.dblClick(confirmButton());
    const busyButton = screen.getByRole('button', { name: 'Eliminando…' });
    expect(busyButton).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    expect(dialog()).toHaveAttribute('aria-busy', 'true');
    // El foco no cae en <body>.
    expect(dialog()).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    await user.click(dialog().parentElement as HTMLElement);
    await user.tab();
    expect(dialog()).toBeInTheDocument();
    expect(dialog()).toHaveFocus();
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);

    await act(async () => {
      backend.items.splice(1, 1);
      pending.resolve(new Response(null, { status: 204 }));
    });
    expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
    expect(backend.deletes()).toHaveLength(1);
  });

  it('dos clics antes de que React redibuje (guardia síncrona) siguen siendo una sola petición', async () => {
    const pending = deferred<Response>();
    const backend = stubBackend(makeItems(3), () => pending.promise);
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    const button = confirmButton();

    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(backend.deletes()).toHaveLength(1));
    pending.resolve(new Response(null, { status: 204 }));
    await screen.findByText('Postulación eliminada');
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);
  });

  it('borrar una fila no deja el aviso ni el diálogo de la siguiente', async () => {
    const { user } = await openFor('Empresa 1');
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await user.click(deleteButton('Empresa 2'));
    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('páginas', () => {
  it('si era la única fila de la última página, vuelve a la anterior', async () => {
    const backend = stubBackend(makeItems(21));
    const { user, router } = renderWithProviders('/?page=2');
    await findTable();
    expect(bodyRows()).toHaveLength(1);
    await user.click(deleteButton('Empresa 21'));

    await user.click(confirmButton());

    expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
    expect(await screen.findByText('Empresa 20')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.queryByText('Esta página no existe')).toBeNull();
    expect(bodyRows()).toHaveLength(20);
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/21']);
  });

  it('conserva los filtros al retroceder de página', async () => {
    const items = makeItems(21).map((item) => ({ ...item, status: 'interview' as const }));
    stubBackend(items);
    const { user, router } = renderWithProviders('/?status=interview&page=2');
    await findTable();
    await user.click(deleteButton('Empresa 21'));
    await user.click(confirmButton());

    expect(await screen.findByText('Empresa 20')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?status=interview');
  });

  it('si borrar una fila no vacía la página, se queda donde está', async () => {
    const backend = stubBackend(makeItems(25));
    const { user, router } = renderWithProviders('/?page=2');
    await findTable();
    await user.click(deleteButton('Empresa 21'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await screen.findByText('Mostrando 21–24 de 24');

    expect(router.state.location.search).toBe('?page=2');
    expect(backend.deletes()).toHaveLength(1);
  });

  it('si borras el único elemento, aparece el estado vacío', async () => {
    stubBackend(makeItems(1));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());

    expect(await screen.findByText('Aún no registras postulaciones')).toBeInTheDocument();
    expect(screen.getByText('Postulación eliminada')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(heading()).toHaveFocus();
  });
});

describe('errores de la API', () => {
  it('un 500 aparece dentro del diálogo, que sigue abierto, y se puede reintentar', async () => {
    let attempts = 0;
    const backend = stubBackend(makeItems(3), (_id, remove) => {
      attempts += 1;
      if (attempts === 1)
        return errorResponse(500, 'internal_error', 'Error interno del servidor.');
      remove();
      return new Response(null, { status: 204 });
    });
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    const listBefore = backend.count('GET /api/v1/applications');

    await user.click(confirmButton());

    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Error interno del servidor.');
    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
    expect(confirmButton()).toBeEnabled();
    expect(cancelButton()).toBeEnabled();
    expect(cancelButton()).toHaveFocus();
    expect(screen.queryByText('Postulación eliminada')).toBeNull();
    // La lista no se tocó.
    expect(bodyRows()).toHaveLength(3);
    expect(backend.count('GET /api/v1/applications')).toBe(listBefore);

    await user.click(confirmButton());

    expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
    expect(backend.deletes()).toHaveLength(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(bodyRows()).toHaveLength(2);
  });

  it('un fallo de red también aparece dentro del diálogo', async () => {
    const backend = stubBackend(makeItems(2));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    const original = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'DELETE') throw new TypeError('Failed to fetch');
      return original!(input, init);
    });

    await user.click(confirmButton());

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(confirmButton()).toBeEnabled();
    expect(backend.items).toHaveLength(2);
  });

  it('el error se puede cancelar: el diálogo se cierra, la lista sigue igual y el foco vuelve al ✕', async () => {
    stubBackend(makeItems(3), () =>
      errorResponse(500, 'internal_error', 'Error interno del servidor.'),
    );
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 3'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(bodyRows()).toHaveLength(3);
    expect(deleteButton('Empresa 3')).toHaveFocus();
  });

  it('un error anterior no se queda al abrir el diálogo de otra fila', async () => {
    stubBackend(makeItems(3), () =>
      errorResponse(500, 'internal_error', 'Error interno del servidor.'),
    );
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');
    await user.click(cancelButton());

    await user.click(deleteButton('Empresa 2'));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('404 (ya la habían borrado)', () => {
    async function deleteGone(items = makeItems(3), route = '/', company = 'Empresa 2') {
      const backend = stubBackend(items, (id, remove) => {
        remove();
        return errorResponse(404, 'not_found', `No existe la postulación ${id}.`);
      });
      const view = renderWithProviders(route);
      await findTable();
      await view.user.click(deleteButton(company));
      await view.user.click(confirmButton());
      await within(dialog()).findByRole('alert');
      return { ...view, backend };
    }

    it('dice "Esta postulación ya no existe." dentro del diálogo, que espera a que lo cierres', async () => {
      await deleteGone();

      expect(within(dialog()).getByRole('alert')).toHaveTextContent(
        'Esta postulación ya no existe.',
      );
      expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
      // Sin reintento: ya no tiene caso.
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
      expect(screen.queryByText('Postulación eliminada')).toBeNull();
    });

    it('la lista y las estadísticas se actualizan sin esperar a cerrarlo', async () => {
      const { backend } = await deleteGone();

      expect(await screen.findByText('2 registradas en total.')).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: 'Empresa 2' })).toBeNull();
      expect(bodyRows()).toHaveLength(2);
      expect(backend.deletes()).toHaveLength(1);
    });

    it('al cerrar, el foco va al título porque la fila ya no existe', async () => {
      const { user } = await deleteGone();
      await screen.findByText('2 registradas en total.');

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(heading()).toHaveFocus();
    });

    it('si era la última fila de la última página, al cerrar vuelve a la anterior', async () => {
      const { user, router } = await deleteGone(makeItems(21), '/?page=2', 'Empresa 21');
      await screen.findByText('Esta página no existe');

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      expect(await screen.findByText('Empresa 20')).toBeInTheDocument();
      expect(router.state.location.search).toBe('');
      expect(screen.queryByText('Esta página no existe')).toBeNull();
    });
  });
});

describe('accesibilidad', () => {
  it('el aviso se muestra en la región de estado y el diálogo ya no está al anunciarlo', async () => {
    const { user } = await openFor('Empresa 1');
    await user.click(confirmButton());

    const status = await screen.findByRole('status');
    expect(within(status).getByText('Postulación eliminada')).toBeInTheDocument();
    expect(status.closest('[inert]')).toBeNull();
  });
});
