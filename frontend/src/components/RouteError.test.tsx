import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';

// Simula una pantalla que falla al dibujarse para comprobar el ErrorBoundary de las rutas reales.
vi.mock('../features/stats/StatsPage', () => ({
  StatsPage: () => {
    throw new Error('Falla simulada');
  },
}));

describe('RouteError', () => {
  it('muestra un aviso en español sin perder la barra superior', async () => {
    // React y React Router registran el error en la consola; aquí es lo esperado.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderWithProviders('/stats');

    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    expect(screen.queryByText('Falla simulada')).not.toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await user.click(within(nav).getByRole('link', { name: 'Postulaciones' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Postulaciones' }),
    ).toBeInTheDocument();
  });
});
