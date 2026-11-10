/**
 * Aceptación de la issue #15 (HU-05) vista de punta a punta con una API en memoria: sin confirmar
 * no hay `DELETE`, al confirmar hay exactamente uno, y la lista, los contadores y la paginación
 * quedan coherentes. Complementa `ApplicationsPage.delete.test.tsx` (no repite sus casos).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE, UNEXPECTED_RESPONSE_MESSAGE } from '../../api/client';
import { SERVICE_UNAVAILABLE_MESSAGE } from '../../api/client';
import type { Application } from '../../api/types';
import { errorResponse, makeApplication } from '../../test/api';
import { stubDeleteBackend } from '../../test/deleteApi';
import { bodyRows, deferred, findTable, makeItems } from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';
import { GONE_MESSAGE } from './ApplicationsPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const dialog = () => screen.getByRole('alertdialog');
const confirmButton = () => screen.getByRole('button', { name: 'Eliminar' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancelar' });
const heading = () => screen.getByRole('heading', { level: 1, name: 'Postulaciones' });
const deleteButtons = () => screen.getAllByRole('button', { name: /^Eliminar la postulación de / });
const deleteButton = (company: string) =>
  screen.getByRole('button', { name: `Eliminar la postulación de ${company}` });

/** Postulaciones con estados repartidos, para ver bajar los contadores. */
function withStatuses(): Application[] {
  const statuses = ['applied', 'applied', 'interview', 'interview', 'offer', 'rejected'] as const;
  return statuses.map((status, index) =>
    makeApplication({
      id: index + 1,
      company: `Empresa ${index + 1}`,
      position: `Puesto ${index + 1}`,
      status,
    }),
  );
}

function stripGrow(): Record<string, string> {
  const segments = document.querySelectorAll<HTMLElement>('[data-status][style*="flex-grow"]');
  return Object.fromEntries(
    Array.from(segments).map((segment) => [segment.dataset.status, segment.style.flexGrow]),
  );
}

function statusButton(label: string) {
  return within(screen.getByRole('group', { name: 'Filtrar por estado' })).getByRole('button', {
    name: new RegExp(`^${label}\\s`),
  });
}

describe('HU-05: sin confirmar NUNCA se borra', () => {
  it.each([
    [
      'Cancelar',
      (user: ReturnType<typeof renderWithProviders>['user']) => user.click(cancelButton()),
    ],
    ['Esc', (user: ReturnType<typeof renderWithProviders>['user']) => user.keyboard('{Escape}')],
    [
      'clic en el fondo',
      (user: ReturnType<typeof renderWithProviders>['user']) =>
        user.click(dialog().parentElement as HTMLElement),
    ],
    [
      'Enter sobre Cancelar (el foco inicial)',
      (user: ReturnType<typeof renderWithProviders>['user']) => user.keyboard('{Enter}'),
    ],
    [
      'Espacio sobre Cancelar (el foco inicial)',
      (user: ReturnType<typeof renderWithProviders>['user']) => user.keyboard(' '),
    ],
  ])('cerrar con %s no manda ninguna petición de escritura', async (_name, close) => {
    const backend = stubDeleteBackend(withStatuses());
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 3'));
    const getsBefore = backend.calls.length;

    await close(user);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(backend.writes()).toEqual([]);
    expect(backend.calls).toHaveLength(getsBefore);
    expect(bodyRows()).toHaveLength(6);
    expect(screen.getByText('6 registradas en total.')).toBeInTheDocument();
    expect(screen.queryByText('Postulación eliminada')).toBeNull();
  });

  it('abrir y cerrar el diálogo varias veces seguidas nunca borra nada', async () => {
    const backend = stubDeleteBackend(withStatuses());
    const { user } = renderWithProviders('/');
    await findTable();

    for (const company of ['Empresa 1', 'Empresa 4', 'Empresa 6', 'Empresa 1']) {
      await user.click(deleteButton(company));
      await user.keyboard('{Escape}');
    }

    expect(backend.writes()).toEqual([]);
  });

  it('navegar a otra pantalla con el diálogo abierto (botón atrás del navegador) no borra', async () => {
    const backend = stubDeleteBackend(withStatuses());
    const { user, router } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));

    await act(() => router.navigate('/stats'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(backend.writes()).toEqual([]);
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('HU-05: al confirmar', () => {
  it('manda un solo DELETE de ese id, ninguna otra escritura, y bajan la lista, el total, los botones de estado y la franja', async () => {
    const backend = stubDeleteBackend(withStatuses());
    const { user } = renderWithProviders('/');
    await findTable();
    expect(screen.getByText('6 registradas en total.')).toBeInTheDocument();
    expect(statusButton('Todas')).toHaveTextContent('Todas 6');
    expect(statusButton('Entrevista')).toHaveTextContent('Entrevista 2');
    expect(stripGrow()).toEqual({ applied: '2', interview: '2', offer: '1', rejected: '1' });

    await user.click(deleteButton('Empresa 3'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    expect(backend.writes()).toEqual(['DELETE /api/v1/applications/3']);
    expect(bodyRows()).toHaveLength(5);
    expect(screen.queryByRole('cell', { name: 'Empresa 3' })).toBeNull();
    expect(await screen.findByText('5 registradas en total.')).toBeInTheDocument();
    await waitFor(() => expect(statusButton('Entrevista')).toHaveTextContent('Entrevista 1'));
    expect(statusButton('Todas')).toHaveTextContent('Todas 5');
    expect(statusButton('Postulado')).toHaveTextContent('Postulado 2');
    expect(stripGrow()).toEqual({ applied: '2', interview: '1', offer: '1', rejected: '1' });
  });

  it('al borrar la única postulación de un estado, su contador queda en 0 y desaparece de la franja', async () => {
    stubDeleteBackend(withStatuses());
    const { user } = renderWithProviders('/');
    await findTable();

    await user.click(deleteButton('Empresa 5'));
    await user.click(confirmButton());

    await waitFor(() => expect(statusButton('Oferta')).toHaveTextContent('Oferta 0'));
    expect(stripGrow()).toEqual({ applied: '2', interview: '2', rejected: '1' });
  });

  it('con un solo registro en total, el texto del contador pasa a singular y luego desaparece la tabla', async () => {
    stubDeleteBackend(makeItems(2));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());

    expect(await screen.findByText('1 registrada en total.')).toBeInTheDocument();
  });

  it('con filtros activos los conserva todos después de borrar (status, q, sort y page)', async () => {
    const all = [
      ...makeItems(25).map((item) =>
        makeApplication({ ...item, company: `Data Corp ${item.id}`, status: 'interview' }),
      ),
      ...makeItems(20, 100).map((item) => makeApplication({ ...item, status: 'applied' })),
    ];
    const backend = stubDeleteBackend(all);
    const route = '/?status=interview&q=data&sort=company&page=2';
    const { user, router } = renderWithProviders(route);
    await findTable();
    expect(bodyRows()).toHaveLength(5);
    const searchBefore = router.state.location.search;

    await user.click(deleteButtons()[0]);
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await screen.findByText('Mostrando 21–24 de 24');

    expect(router.state.location.search).toBe(searchBefore);
    expect(backend.listParams().at(-1)).toEqual({
      status: 'interview',
      q: 'data',
      sort: 'company',
      page: '2',
      per_page: '20',
    });
    expect(screen.getByRole('searchbox', { name: /Buscar/ })).toHaveValue('data');
    expect(statusButton('Entrevista')).toHaveAttribute('aria-pressed', 'true');
  });

  it('con filtros y la última fila de la última página, retrocede de página sin perder los demás filtros', async () => {
    const all = makeItems(21).map((item) =>
      makeApplication({ ...item, company: `Data Corp ${item.id}`, status: 'interview' }),
    );
    const backend = stubDeleteBackend(all);
    const { user, router } = renderWithProviders('/?status=interview&q=data&sort=company&page=2');
    await findTable();
    expect(bodyRows()).toHaveLength(1);

    await user.click(deleteButtons()[0]);
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await waitFor(() => expect(bodyRows()).toHaveLength(20));

    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
      status: 'interview',
      q: 'data',
      sort: 'company',
    });
    expect(backend.writes()).toHaveLength(1);
  });
});

describe('borrar la fila correcta', () => {
  /** Cinco "Oracle" con ids que no son consecutivos; se muestran en este orden (fecha descendente). */
  function oracles(): Application[] {
    return [17, 3, 42, 8, 29].map((id, index) =>
      makeApplication({
        id,
        company: 'Oracle',
        position: `Puesto ${id}`,
        applied_on: `2026-09-${String(28 - index).padStart(2, '0')}`,
      }),
    );
  }

  it('con nombres repetidos, la fila 3 borra el id de la fila 3', async () => {
    const backend = stubDeleteBackend(oracles());
    const { user } = renderWithProviders('/');
    await findTable();

    await user.click(deleteButtons()[2]);
    expect(dialog()).toHaveAccessibleDescription('Puesto 42. Esta acción no se puede deshacer.');
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/42']);
    expect(backend.items.map((item) => item.id)).toEqual([17, 3, 8, 29]);
    expect(screen.queryByRole('cell', { name: 'Puesto 42' })).toBeNull();
    expect(bodyRows()).toHaveLength(4);
  });

  it('con la lista refrescándose por debajo (otro orden y una fila nueva), el diálogo y el DELETE siguen siendo los de la fila elegida', async () => {
    const backend = stubDeleteBackend(oracles());
    const { user, router, queryClient } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButtons()[2]);

    // Otra pestaña agrega una postulación arriba y la lista llega con otro orden.
    backend.items.unshift(
      makeApplication({
        id: 99,
        company: 'Oracle',
        position: 'Puesto 99',
        applied_on: '2026-09-30',
      }),
    );
    backend.items.reverse();
    await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));
    await within(screen.getByRole('table')).findByRole('cell', { name: 'Puesto 99' });
    // Y la dirección cambia de orden (equivale a usar atrás/adelante con el diálogo abierto).
    await act(() => router.navigate('/?sort=company'));
    await waitFor(() => expect(bodyRows()).toHaveLength(6));

    expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Oracle?');
    expect(dialog()).toHaveAccessibleDescription('Puesto 42. Esta acción no se puede deshacer.');
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/42']);
    expect(backend.items.map((item) => item.id).sort((a, b) => a - b)).toEqual([3, 8, 17, 29, 99]);
    expect(screen.getByRole('cell', { name: 'Puesto 99' })).toBeInTheDocument();
  });

  it('el foco vuelve al ✕ de la fila elegida (no al de otra con el mismo nombre) al cancelar', async () => {
    stubDeleteBackend(oracles());
    const { user } = renderWithProviders('/');
    await findTable();

    await user.click(deleteButtons()[3]);
    await user.keyboard('{Escape}');

    expect(deleteButtons()[3]).toHaveFocus();
    expect(deleteButtons()[3].closest('tr')).toHaveTextContent('Puesto 8');
  });
});

describe('paginación al borrar', () => {
  /** Abre `route`, borra la fila `rowIndex` (0 = primera) y espera el aviso. */
  async function removeRow(total: number, page: number, rowIndex: number) {
    const backend = stubDeleteBackend(makeItems(total));
    const view = renderWithProviders(page === 1 ? '/' : `/?page=${page}`);
    await findTable();
    const buttons = deleteButtons();
    await view.user.click(buttons[rowIndex === -1 ? buttons.length - 1 : rowIndex]);
    await view.user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    return { ...view, backend };
  }

  it.each([
    // total, página, fila, filas después, "Mostrando…", búsqueda esperada, ¿hay paginación?
    [20, 1, -1, 19, 'Mostrando 1–19 de 19', '', false],
    [21, 1, 0, 20, 'Mostrando 1–20 de 20', '', false],
    [21, 2, 0, 20, 'Mostrando 1–20 de 20', '', false],
    [40, 2, -1, 19, 'Mostrando 21–39 de 39', '?page=2', true],
    [41, 1, 0, 20, 'Mostrando 1–20 de 40', '', true],
    [41, 2, 0, 20, 'Mostrando 21–40 de 40', '?page=2', true],
    [41, 3, 0, 20, 'Mostrando 21–40 de 40', '?page=2', true],
  ])(
    'total %i, página %i, fila %i: quedan %i filas, "%s", URL "%s"',
    async (total, page, rowIndex, rowsAfter, summary, search, hasPagination) => {
      const { router, backend } = await removeRow(total, page, rowIndex);

      expect(await screen.findByText(summary)).toBeInTheDocument();
      await waitFor(() => expect(bodyRows()).toHaveLength(rowsAfter));
      expect(router.state.location.search).toBe(search);
      expect(screen.queryByRole('navigation', { name: 'Paginación' }) !== null).toBe(hasPagination);
      expect(screen.queryByText('Esta página no existe')).toBeNull();
      expect(backend.deletes()).toHaveLength(1);
    },
  );

  it('retroceder de página usa "replace": atrás no regresa a la página vacía', async () => {
    const { router } = await removeRow(21, 2, 0);
    await waitFor(() => expect(bodyRows()).toHaveLength(20));
    const lengthBefore = router.state.historyAction;

    expect(lengthBefore).toBe('REPLACE');
  });

  it('?page=9 escrito a mano sigue mostrando "Esta página no existe" y no ofrece borrar nada', async () => {
    const backend = stubDeleteBackend(makeItems(24));
    const { user } = renderWithProviders('/?page=9');

    expect(await screen.findByText('Esta página no existe')).toBeInTheDocument();
    expect(screen.getByText('Hay 2 páginas de resultados.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Eliminar la postulación/ })).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Ir a la primera página' }));
    await waitFor(() => expect(bodyRows()).toHaveLength(20));
    expect(backend.writes()).toEqual([]);
  });

  it('tras cerrarse el diálogo, al borrar la última fila de la última página nunca se ve "Esta página no existe"', async () => {
    // Antes la lista se refrescaba antes de volver a la página anterior y, con el diálogo ya
    // cerrado, se pintaba "Esta página no existe" (y su botón) junto al aviso. Ahora se retrocede
    // en cuanto responde el DELETE y, en el instante con la página vacía, se pinta "cargando".
    const backend = stubDeleteBackend(makeItems(21));
    const { user } = renderWithProviders('/?page=2');
    await findTable();
    await user.click(deleteButton('Empresa 21'));

    const visibleWithoutDialog: string[] = [];
    const observer = new MutationObserver(() => {
      const noDialog = document.querySelector('[role="alertdialog"]') === null;
      if (noDialog && screen.queryByText('Esta página no existe')) {
        visibleWithoutDialog.push('Esta página no existe');
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await waitFor(() => expect(bodyRows()).toHaveLength(20));
    observer.disconnect();

    expect(backend.deletes()).toHaveLength(1);
    expect(visibleWithoutDialog).toEqual([]);
  });
});

describe('errores de la API dentro del diálogo', () => {
  const failures: [string, () => Response | Promise<Response>, string][] = [
    [
      '500 con el formato de la API',
      () => errorResponse(500, 'internal_error', 'Error interno del servidor.'),
      'Error interno del servidor.',
    ],
    [
      '503 de un proxy (HTML, sin formato)',
      () =>
        new Response('<html>Service Unavailable</html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        }),
      SERVICE_UNAVAILABLE_MESSAGE,
    ],
    [
      '400 con el formato de la API',
      () => errorResponse(400, 'bad_request', 'El identificador no es válido.'),
      'El identificador no es válido.',
    ],
    [
      '500 que no es JSON',
      () => new Response('boom', { status: 500 }),
      UNEXPECTED_RESPONSE_MESSAGE,
    ],
    [
      '200 con HTML (el proxy devolvió otra página)',
      () =>
        new Response('<!doctype html><title>app</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      UNEXPECTED_RESPONSE_MESSAGE,
    ],
    ['red caída', () => Promise.reject(new TypeError('Failed to fetch')), NETWORK_ERROR_MESSAGE],
  ];

  it.each(failures)(
    '%s: alerta dentro del diálogo, sigue abierto, no toca la lista y reintentar manda otra petición',
    async (_name, failure, message) => {
      const backend = stubDeleteBackend(makeItems(4));
      backend.handlers.delete = failure;
      const { user } = renderWithProviders('/');
      await findTable();
      await user.click(deleteButton('Empresa 2'));
      const readsBefore = backend.calls.filter((call) => call.method === 'GET').length;

      await user.click(confirmButton());

      const alert = await within(dialog()).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(within(dialog()).getAllByRole('alert')).toHaveLength(1);
      expect(dialog()).toHaveAccessibleName('¿Eliminar la postulación a Empresa 2?');
      expect(confirmButton()).toBeEnabled();
      expect(cancelButton()).toHaveFocus();
      expect(screen.queryByText('Postulación eliminada')).toBeNull();
      expect(bodyRows()).toHaveLength(4);
      // La caché no se toca con un error que no es 404: ni una lectura más.
      expect(backend.calls.filter((call) => call.method === 'GET')).toHaveLength(readsBefore);
      expect(backend.deletes()).toHaveLength(1);

      backend.handlers.delete = undefined;
      await user.click(confirmButton());

      expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
      expect(backend.deletes()).toEqual([
        'DELETE /api/v1/applications/2',
        'DELETE /api/v1/applications/2',
      ]);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(bodyRows()).toHaveLength(3);
    },
  );

  it('al reintentar se borra el error anterior mientras espera ("Eliminando…" sin alerta vieja)', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');

    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    await user.click(confirmButton());

    expect(within(dialog()).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled();
    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByText('Postulación eliminada');
  });

  it('doble clic rápido en Eliminar después de un 500 manda UNA petición más, no dos', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');
    expect(backend.deletes()).toHaveLength(1);

    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    await user.dblClick(confirmButton());

    expect(backend.deletes()).toHaveLength(2);
    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByText('Postulación eliminada');
    expect(backend.deletes()).toHaveLength(2);
  });

  it('dos fallos seguidos no apilan alertas ni dejan el diálogo bloqueado', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.click(confirmButton());
      await waitFor(() => expect(backend.deletes()).toHaveLength(attempt + 1));
      await within(dialog()).findByRole('alert');
      await waitFor(() => expect(confirmButton()).toBeEnabled());
    }

    expect(within(dialog()).getAllByRole('alert')).toHaveLength(1);
    expect(bodyRows()).toHaveLength(3);
  });

  describe('404', () => {
    async function openGone(items = makeItems(3), route = '/', company = 'Empresa 2') {
      const backend = stubDeleteBackend(items);
      backend.handlers.delete = (id, remove) => {
        remove();
        return errorResponse(404, 'not_found', `No existe la postulación ${id}.`);
      };
      const view = renderWithProviders(route);
      await findTable();
      await view.user.click(deleteButton(company));
      await view.user.click(confirmButton());
      await within(dialog()).findByRole('alert');
      return { ...view, backend };
    }

    it('dice que ya no existe (no el mensaje de la API), con solo "Cerrar", y no avisa de éxito', async () => {
      await openGone();

      expect(within(dialog()).getByRole('alert')).toHaveTextContent(GONE_MESSAGE);
      expect(within(dialog()).getByRole('alert')).not.toHaveTextContent('No existe la postulación');
      expect(
        within(dialog())
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Cerrar']);
      expect(screen.queryByText('Postulación eliminada')).toBeNull();
    });

    it('no deja la fila fantasma: tras el 404 la lista y las estadísticas ya no la tienen, incluso antes de cerrar', async () => {
      const { backend } = await openGone(withStatuses(), '/', 'Empresa 3');

      await waitFor(() => expect(bodyRows()).toHaveLength(5));
      expect(await screen.findByText('5 registradas en total.')).toBeInTheDocument();
      await waitFor(() =>
        expect(stripGrow()).toEqual({ applied: '2', interview: '1', offer: '1', rejected: '1' }),
      );
      expect(document.querySelector('[data-delete-id="3"]')).toBeNull();
      expect(backend.deletes()).toHaveLength(1);
    });

    it('Esc también cierra el aviso de 404 y, al cerrar, no queda nada de esa fila', async () => {
      const { user } = await openGone();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText(/Empresa 2/)).toBeNull();
      expect(document.querySelector('[data-delete-id="2"]')).toBeNull();
      expect(heading()).toHaveFocus();
      expect(document.querySelector('[inert]')).toBeNull();
    });

    it('Tab no se escapa del único botón "Cerrar"', async () => {
      const { user } = await openGone();
      const close = screen.getByRole('button', { name: 'Cerrar' });
      expect(close).toHaveFocus();

      await user.tab();
      expect(close).toHaveFocus();
      await user.tab({ shift: true });
      expect(close).toHaveFocus();
    });

    it('404 en la última fila de la última página, con filtros: al cerrar vuelve a la página anterior y los conserva', async () => {
      const all = makeItems(21).map((item) =>
        makeApplication({ ...item, company: `Data Corp ${item.id}`, status: 'interview' }),
      );
      const { user, router } = await openGone(
        all,
        '/?status=interview&q=data&sort=company&page=2',
        'Data Corp 9',
      );
      await screen.findByText('Esta página no existe');

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => expect(bodyRows()).toHaveLength(20));
      expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({
        status: 'interview',
        q: 'data',
        sort: 'company',
      });
      expect(screen.queryByText('Esta página no existe')).toBeNull();
    });
  });
});

describe('doble clic y teclas repetidas: una sola petición', () => {
  type Press = (user: ReturnType<typeof renderWithProviders>['user']) => Promise<void>;
  const presses: [string, Press][] = [
    ['doble clic', (user) => user.dblClick(confirmButton())],
    [
      'Enter repetido',
      async (user) => {
        await user.tab();
        await user.keyboard('{Enter}{Enter}{Enter}');
      },
    ],
    [
      'clic y luego Enter',
      async (user) => {
        await user.click(confirmButton());
        await user.keyboard('{Enter}');
      },
    ],
    [
      'Espacio repetido',
      async (user) => {
        await user.tab();
        await user.keyboard('   ');
      },
    ],
    [
      'Enter y Espacio mezclados',
      async (user) => {
        await user.tab();
        await user.keyboard('{Enter} {Enter} ');
      },
    ],
  ];

  it.each(presses)(
    '%s sobre Eliminar manda un solo DELETE y un solo aviso',
    async (_name, press) => {
      const backend = stubDeleteBackend(makeItems(3));
      const pending = deferred<Response>();
      backend.handlers.delete = () => pending.promise;
      const { user } = renderWithProviders('/');
      await findTable();
      await user.click(deleteButton('Empresa 2'));

      await press(user);
      expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);

      await act(async () => {
        backend.items.splice(1, 1);
        pending.resolve(new Response(null, { status: 204 }));
      });
      await screen.findByText('Postulación eliminada');
      expect(backend.deletes()).toHaveLength(1);
      expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    },
  );

  it('con la petición en vuelo, Esc, Cancelar y el fondo no hacen nada y el diálogo no se cierra a medias', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());

    await user.keyboard('{Escape}');
    await user.click(cancelButton());
    await user.click(dialog().parentElement as HTMLElement);
    expect(dialog()).toBeInTheDocument();
    expect(dialog()).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      backend.items.splice(1, 1);
      pending.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByText('Postulación eliminada');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(heading()).toHaveFocus();
    expect(backend.deletes()).toHaveLength(1);
  });

  it('un Esc durante la petición no impide ver el error si la respuesta es un 500, y luego Esc sí cierra', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());
    await user.keyboard('{Escape}');

    await act(async () => {
      pending.resolve(errorResponse(500, 'internal_error', 'Error interno del servidor.'));
    });

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Error interno del servidor.',
    );
    expect(cancelButton()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deleteButton('Empresa 2')).toHaveFocus();
    expect(backend.deletes()).toHaveLength(1);
  });

  it('la lista que llega mientras se espera no cierra el diálogo ni cambia el botón', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user, queryClient } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());

    await act(() => queryClient.invalidateQueries({ queryKey: ['applications'] }));

    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled();
    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByText('Postulación eliminada');
  });

  it('si las lecturas posteriores al borrado tardan, el diálogo se cierra igual en cuanto responde el DELETE', async () => {
    // La mutación no espera la lista ni las estadísticas nuevas: el borrado ya ocurrió y el
    // usuario no debe quedarse en "Eliminando…" si esa lectura tarda o no responde.
    const backend = stubDeleteBackend(makeItems(3));
    const slowStats = deferred<void>();
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    backend.handlers.stats = () => slowStats.promise;

    await user.click(confirmButton());

    expect(await screen.findByText('Postulación eliminada')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // La fila ya no está aunque la lista nueva no haya llegado (se quita de la caché).
    expect(screen.queryByRole('cell', { name: 'Empresa 2' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Postulaciones' })).toHaveFocus();
    expect(backend.deletes()).toHaveLength(1);

    await act(async () => {
      slowStats.resolve();
    });
    expect(await screen.findByText('2 registradas en total.')).toBeInTheDocument();
    expect(backend.deletes()).toHaveLength(1);
  });

  describe('desmontar la pantalla con la petición en vuelo', () => {
    it('al ir a /stats y volver no hay errores de React, ni aviso duplicado, y la lista ya no tiene la fila', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const backend = stubDeleteBackend(makeItems(3));
      const pending = deferred<Response>();
      backend.handlers.delete = () => pending.promise;
      const { user, router } = renderWithProviders('/');
      await findTable();
      await user.click(deleteButton('Empresa 2'));
      await user.click(confirmButton());

      await act(() => router.navigate('/stats'));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.querySelector('[inert]')).toBeNull();
      expect(document.body.style.overflow).toBe('');
      await act(async () => {
        backend.items.splice(1, 1);
        pending.resolve(new Response(null, { status: 204 }));
      });
      await new Promise((resolve) => setTimeout(resolve, 30));

      await act(() => router.navigate('/'));
      await findTable();
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryAllByText('Postulación eliminada').length).toBeLessThanOrEqual(1);
      expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);
      expect(errors).not.toHaveBeenCalled();
      expect(warns).not.toHaveBeenCalled();
    });

    it('si la petición falla después de salir, no hay errores ni diálogo fantasma al volver', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const backend = stubDeleteBackend(makeItems(3));
      const pending = deferred<Response>();
      backend.handlers.delete = () => pending.promise;
      const { user, router } = renderWithProviders('/');
      await findTable();
      await user.click(deleteButton('Empresa 2'));
      await user.click(confirmButton());
      await act(() => router.navigate('/stats'));

      await act(async () => {
        pending.resolve(errorResponse(500, 'internal_error', 'Error interno.'));
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      await act(() => router.navigate('/'));
      await findTable();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(bodyRows()).toHaveLength(3);
      expect(errors).not.toHaveBeenCalled();
      // Se puede volver a intentar sin que el candado de "ya hay una petición" haya quedado puesto.
      await user.click(deleteButton('Empresa 2'));
      backend.handlers.delete = undefined;
      await user.click(confirmButton());
      await screen.findByText('Postulación eliminada');
      expect(backend.deletes()).toHaveLength(2);
    });
  });

  it('atrás del navegador con la petición en vuelo: al llegar el 204 no se pisa la dirección a la que fue el usuario', async () => {
    // El retroceso de página se calcula con la dirección vigente: si el usuario ya cambió de
    // dirección con atrás/adelante mientras esperaba, no se navega.
    const backend = stubDeleteBackend(makeItems(21));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user, router } = renderWithProviders('/?page=2');
    await findTable();
    await user.click(deleteButton('Empresa 21'));
    await user.click(confirmButton());

    await act(() => router.navigate('/?q=empresa'));
    await act(async () => {
      backend.items.pop();
      pending.resolve(new Response(null, { status: 204 }));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.state.location.search).toBe('?q=empresa');
  });
});

describe('el aviso "Postulación eliminada"', () => {
  it('aparece una vez, en la región de estado, y solo después de que la fila ya no está', async () => {
    stubDeleteBackend(makeItems(3));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));

    const snapshots: { rowPresent: boolean; dialogOpen: boolean }[] = [];
    const observer = new MutationObserver(() => {
      if (screen.queryByText('Postulación eliminada')) {
        snapshots.push({
          rowPresent: screen.queryByRole('cell', { name: 'Empresa 2' }) !== null,
          dialogOpen: document.querySelector('[role="alertdialog"]') !== null,
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await new Promise((resolve) => setTimeout(resolve, 30));
    observer.disconnect();

    expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Postulación eliminada');
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((snapshot) => !snapshot.rowPresent && !snapshot.dialogOpen)).toBe(true);
  });

  it('no aparece al cancelar ni cuando la API falla', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.keyboard('{Escape}');
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');
    await user.click(cancelButton());

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('sobrevive al pasar a otra página de la lista y a otra pantalla, y no se duplica', async () => {
    stubDeleteBackend(makeItems(45));
    const { user, router } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Mostrando 21–40 de 44');
    expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);

    await act(() => router.navigate('/stats'));
    expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);
  });

  it('dos borrados seguidos dejan un solo aviso (el segundo reemplaza al primero)', async () => {
    stubDeleteBackend(makeItems(4));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());
    await waitFor(() => expect(bodyRows()).toHaveLength(2));

    expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);
    expect(screen.getByRole('status').querySelectorAll('p')).toHaveLength(1);
  });
});
