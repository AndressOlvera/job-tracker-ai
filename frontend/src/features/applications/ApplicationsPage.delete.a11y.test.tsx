/**
 * Issue #15: teclado, lector de pantalla, fugas (`inert`, `overflow`, listeners), StrictMode y
 * textos hostiles en el diálogo de eliminar, probados desde la pantalla completa.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, makeApplication } from '../../test/api';
import { stubDeleteBackend } from '../../test/deleteApi';
import { bodyRows, deferred, findTable, makeItems } from '../../test/listApi';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders';
import { routes } from '../../routes';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  document.body.style.overflow = '';
});

const dialog = () => screen.getByRole('alertdialog');
const confirmButton = () => screen.getByRole('button', { name: 'Eliminar' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancelar' });
const heading = () => screen.getByRole('heading', { level: 1, name: 'Postulaciones' });
const deleteButton = (company: string) =>
  screen.getByRole('button', { name: `Eliminar la postulación de ${company}` });

function expectFocusInsideDocument() {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).not.toBeNull();
}

/** Cuenta, por tipo de evento, los listeners que se agregaron y no se quitaron en `target`. */
function trackListeners(target: Document | Window) {
  const live = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (!live.has(type)) live.set(type, new Set());
    live.get(type)?.add(listener);
    add(type, listener, options);
  }) as typeof target.addEventListener);
  vi.spyOn(target, 'removeEventListener').mockImplementation(((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    live.get(type)?.delete(listener);
    remove(type, listener, options);
  }) as typeof target.removeEventListener);
  return {
    count: (type: string) => live.get(type)?.size ?? 0,
    snapshot: () =>
      Object.fromEntries(
        Array.from(live)
          .filter(([, set]) => set.size > 0)
          .map(([type, set]) => [type, set.size]),
      ),
  };
}

describe('teclado de principio a fin (HU-05)', () => {
  it('Enter abre, Esc cancela devolviendo el foco al ✕, Espacio abre y confirma; el foco nunca cae en <body>', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user } = renderWithProviders('/');
    await findTable();

    deleteButton('Empresa 2').focus();
    await user.keyboard('{Enter}');
    expect(dialog()).toBeInTheDocument();
    expect(cancelButton()).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deleteButton('Empresa 2')).toHaveFocus();

    await user.keyboard(' ');
    expect(cancelButton()).toHaveFocus();
    await user.tab();
    expect(confirmButton()).toHaveFocus();
    expectFocusInsideDocument();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled();
    expectFocusInsideDocument();

    await act(async () => {
      backend.items.splice(1, 1);
      pending.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByText('Postulación eliminada');
    expect(heading()).toHaveFocus();
    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);
  });

  it('Tab y Shift+Tab giran sin salir, incluso tras un error con reintento', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');

    const order: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      await user.tab();
      order.push(document.activeElement?.textContent ?? '(nada)');
    }
    for (let step = 0; step < 3; step += 1) {
      await user.tab({ shift: true });
      order.push(document.activeElement?.textContent ?? '(nada)');
    }

    expect(order).toEqual([
      'Eliminar',
      'Cancelar',
      'Eliminar',
      'Cancelar',
      'Eliminar',
      'Cancelar',
      'Eliminar',
      'Cancelar',
    ]);
  });

  it('si el foco escapa a la página de atrás, Tab lo trae al primero y Shift+Tab al último', async () => {
    stubDeleteBackend(makeItems(3));
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    const outside = screen.getByRole('link', { name: '+ Nueva postulación' });

    outside.focus();
    await user.tab();
    expect(cancelButton()).toHaveFocus();

    outside.focus();
    await user.tab({ shift: true });
    expect(confirmButton()).toHaveFocus();
  });

  it('con el diálogo abierto, el título, la descripción y los botones son lo único accesible por nombre', async () => {
    stubDeleteBackend([
      makeApplication({ id: 5, company: 'Oracle', position: 'Becario de Software' }),
    ]);
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Oracle'));

    const named = screen.getByRole('alertdialog', { name: '¿Eliminar la postulación a Oracle?' });
    expect(named).toHaveAccessibleDescription(
      'Becario de Software. Esta acción no se puede deshacer.',
    );
    expect(
      within(named)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancelar', 'Eliminar']);
    expect(named.closest('main')).toBeNull();
  });
});

describe('`inert`, `overflow` y listeners', () => {
  it('no pisa un `inert` que ya existía y deja el resto como estaba al cerrar', async () => {
    stubDeleteBackend(makeItems(2));
    const sidebar = document.createElement('aside');
    sidebar.setAttribute('inert', '');
    document.body.append(sidebar);
    const { user, container } = renderWithProviders('/');
    await findTable();

    await user.click(deleteButton('Empresa 1'));
    expect(container).toHaveAttribute('inert');
    expect(sidebar).toHaveAttribute('inert');
    await user.keyboard('{Escape}');

    expect(container).not.toHaveAttribute('inert');
    expect(sidebar).toHaveAttribute('inert');
    sidebar.remove();
  });

  it('restaura el `overflow` que tenía el body (no lo deja en vacío) al cancelar y al borrar', async () => {
    stubDeleteBackend(makeItems(2));
    document.body.style.overflow = 'scroll';
    const { user } = renderWithProviders('/');
    await findTable();

    await user.click(deleteButton('Empresa 1'));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('scroll');

    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('abrir, cancelar, abrir otro y borrar no acumula `inert`, `overflow` ni listeners', async () => {
    stubDeleteBackend(makeItems(5));
    const onDocument = trackListeners(document);
    const onWindow = trackListeners(window);
    const { user } = renderWithProviders('/');
    await findTable();
    const baseline = { document: onDocument.snapshot(), window: onWindow.snapshot() };

    for (const company of ['Empresa 1', 'Empresa 2', 'Empresa 3']) {
      await user.click(deleteButton(company));
      expect(document.querySelectorAll('[inert]').length).toBeGreaterThan(0);
      expect(onDocument.count('keydown')).toBe((baseline.document.keydown ?? 0) + 1);
      await user.keyboard('{Escape}');
      expect(onDocument.count('keydown')).toBe(baseline.document.keydown ?? 0);
    }
    await user.click(deleteButton('Empresa 4'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');

    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
    expect(onDocument.snapshot()).toEqual(baseline.document);
    expect(onWindow.snapshot()).toEqual(baseline.window);
  });

  it('un diálogo con error que se cancela tampoco deja listeners ni `inert`', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const onDocument = trackListeners(document);
    const { user } = renderWithProviders('/');
    await findTable();
    const before = onDocument.snapshot();

    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');
    await user.keyboard('{Escape}');

    expect(onDocument.snapshot()).toEqual(before);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('desmontar la pantalla con el diálogo abierto limpia `inert`, `overflow` y listeners', async () => {
    stubDeleteBackend(makeItems(3));
    const onDocument = trackListeners(document);
    const { user, router } = renderWithProviders('/');
    await findTable();
    const before = onDocument.snapshot();
    await user.click(deleteButton('Empresa 1'));

    await act(() => router.navigate('/stats'));

    expect(onDocument.snapshot()).toEqual(before);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
  });
});

describe('StrictMode', () => {
  function renderStrict(route: string) {
    const router = createMemoryRouter(routes, { initialEntries: [route] });
    const queryClient = createTestQueryClient();
    const user = userEvent.setup();
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
    return { user, router };
  }

  it('un borrado: una petición, un aviso, sin fugas y sin errores de React', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = stubDeleteBackend(makeItems(3));
    const onDocument = trackListeners(document);
    const { user } = renderStrict('/');
    await findTable();
    const before = onDocument.snapshot();

    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    await waitFor(() => expect(bodyRows()).toHaveLength(2));

    expect(backend.deletes()).toEqual(['DELETE /api/v1/applications/2']);
    expect(screen.getAllByText('Postulación eliminada')).toHaveLength(1);
    expect(onDocument.snapshot()).toEqual(before);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
    expect(heading()).toHaveFocus();
    expect(errors).not.toHaveBeenCalled();
  });

  it('cancelar y error: sin aviso, foco correcto y sin fugas', async () => {
    const backend = stubDeleteBackend(makeItems(3));
    backend.handlers.delete = () => errorResponse(500, 'internal_error', 'Error interno.');
    const onDocument = trackListeners(document);
    const { user } = renderStrict('/');
    await findTable();
    const before = onDocument.snapshot();

    await user.click(deleteButton('Empresa 2'));
    await user.keyboard('{Escape}');
    expect(deleteButton('Empresa 2')).toHaveFocus();
    await user.click(deleteButton('Empresa 3'));
    await user.click(confirmButton());
    await within(dialog()).findByRole('alert');
    expect(cancelButton()).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(deleteButton('Empresa 3')).toHaveFocus();
    expect(onDocument.snapshot()).toEqual(before);
    expect(backend.deletes()).toHaveLength(1);
  });

  it('desmontar con la petición en vuelo no produce avisos de React', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = stubDeleteBackend(makeItems(3));
    const pending = deferred<Response>();
    backend.handlers.delete = () => pending.promise;
    const { user, router } = renderStrict('/');
    await findTable();
    await user.click(deleteButton('Empresa 2'));
    await user.click(confirmButton());

    await act(() => router.navigate('/stats'));
    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    cleanup();

    expect(errors).not.toHaveBeenCalled();
  });
});

describe('textos hostiles en el diálogo (se muestran como texto)', () => {
  const cases: [string, string, string][] = [
    ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', 'HTML'],
    ['A'.repeat(500), 'B'.repeat(500), '500 caracteres sin espacios'],
    ['Café ☕ 🚀 👩‍💻', 'Ingeniero/a 🇲🇽 🧑🏽‍🚀', 'emoji'],
    ['شركة النفط العربية', 'مهندس برمجيات', 'árabe (RTL)'],
    ['חברת תוכנה', 'מפתח תוכנה', 'hebreo (RTL)'],
    ['Say "hi" & \'bye\'', 'Dijo "x" & <y> \'z\'', 'comillas y ampersand'],
    ['</h2><h1>x</h1>', '</p><button>Eliminar</button>', 'etiquetas que cierran el diálogo'],
  ];

  it.each(cases)('%s / %s (%s)', async (company, position) => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    stubDeleteBackend([makeApplication({ id: 7, company, position })]);
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(screen.getByRole('button', { name: /^Eliminar la postulación de / }));

    const named = screen.getByRole('alertdialog', {
      name: `¿Eliminar la postulación a ${company}?`,
    });
    expect(named).toHaveAccessibleDescription(`${position}. Esta acción no se puede deshacer.`);
    expect(named.querySelectorAll('img, script, b, h1, h2, button')).toHaveLength(3);
    expect(
      within(named)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancelar', 'Eliminar']);
    expect(named.querySelector('h2')?.textContent).toBe(`¿Eliminar la postulación a ${company}?`);
    expect(named.querySelector('p')?.textContent).toBe(
      `${position}. Esta acción no se puede deshacer.`,
    );
    expect(alert).not.toHaveBeenCalled();

    // Y se borra la fila correcta, sin que el texto raro afecte a la petición.
    await user.click(confirmButton());
    await screen.findByText('Postulación eliminada');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('un mensaje de error de la API con HTML se muestra como texto dentro de la alerta', async () => {
    const backend = stubDeleteBackend(makeItems(2));
    backend.handlers.delete = () =>
      errorResponse(500, 'internal_error', '<img src=x onerror=alert(1)> "falló" & <b>mal</b>');
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(deleteButton('Empresa 1'));
    await user.click(confirmButton());

    const alert = await within(dialog()).findByRole('alert');
    expect(alert.textContent).toBe('<img src=x onerror=alert(1)> "falló" & <b>mal</b>');
    expect(alert.querySelector('img, b')).toBeNull();
  });
});
