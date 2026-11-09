import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from './test/renderWithProviders';

describe('App', () => {
  it('muestra la barra superior y la lista de postulaciones en /', () => {
    renderWithProviders('/');

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Job Tracker' })).toHaveAttribute('href', '/');

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Postulaciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Estadísticas' })).not.toHaveAttribute(
      'aria-current',
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Postulaciones' })).toBeInTheDocument();
  });

  it('navega a Estadísticas desde la barra superior', async () => {
    const { user, router } = renderWithProviders('/');
    const nav = screen.getByRole('navigation', { name: 'Principal' });

    await user.click(within(nav).getByRole('link', { name: 'Estadísticas' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Estadísticas' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/stats');
    expect(within(nav).getByRole('link', { name: 'Estadísticas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Postulaciones' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it.each([
    ['/applications/new', 'Nueva postulación'],
    ['/applications/42/edit', 'Editar postulación'],
    ['/stats', 'Estadísticas'],
    ['/no-existe', 'Página no encontrada'],
  ])('en %s muestra la pantalla "%s" con la barra superior', (route, heading) => {
    renderWithProviders(route);

    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('"Saltar al contenido" es lo primero con el teclado y lleva el foco al contenido', async () => {
    const { user, router } = renderWithProviders('/');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(router.state.location.hash).toBe('');
  });

  it('"Saltar al contenido" apunta al id del <main>, que puede recibir el foco', () => {
    renderWithProviders('/stats');

    const main = screen.getByRole('main');
    expect(main.id).not.toBe('');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      `#${main.id}`,
    );
  });

  it.each(['/applications', '/applications/5', '/applications/new/extra', '/stats/otra', '/a/b/c'])(
    'una ruta desconocida como %s muestra "Página no encontrada" con enlace a la lista',
    (route) => {
      renderWithProviders(route);

      expect(
        screen.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a postulaciones' })).toHaveAttribute('href', '/');
    },
  );

  it.each(['/no-existe', '/stats/otra'])(
    'en la ruta desconocida %s ningún enlace de la barra se marca como página actual',
    (route) => {
      renderWithProviders(route);

      const nav = screen.getByRole('navigation', { name: 'Principal' });
      for (const link of within(nav).getAllByRole('link')) {
        expect(link, link.textContent ?? '').not.toHaveAttribute('aria-current');
      }
    },
  );

  it('"Ir a postulaciones" lleva de la página no encontrada a la lista', async () => {
    const { user, router } = renderWithProviders('/no-existe');

    await user.click(screen.getByRole('link', { name: 'Ir a postulaciones' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Postulaciones' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Postulaciones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
