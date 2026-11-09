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
});
