import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStats } from '../../test/api';
import { StatusFilter } from './StatusFilter';

describe('StatusFilter', () => {
  it('muestra Todas y los cuatro estados con su conteo', () => {
    render(<StatusFilter value={undefined} onChange={vi.fn()} stats={makeStats()} />);
    const group = screen.getByRole('group', { name: 'Filtrar por estado' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas 24' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Postulado 15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrevista 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oferta 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazado 3' })).toBeInTheDocument();
  });

  it('marca con aria-pressed solo el filtro activo', () => {
    const { rerender } = render(
      <StatusFilter value={undefined} onChange={vi.fn()} stats={makeStats()} />,
    );
    expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);

    rerender(<StatusFilter value="offer" onChange={vi.fn()} stats={makeStats()} />);
    expect(screen.getByRole('button', { name: /Oferta/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Todas/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('avisa qué estado se eligió, y undefined con Todas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StatusFilter value="offer" onChange={onChange} stats={makeStats()} />);
    await user.click(screen.getByRole('button', { name: /Rechazado/ }));
    expect(onChange).toHaveBeenLastCalledWith('rejected');
    await user.click(screen.getByRole('button', { name: /Todas/ }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('la franja es decorativa y solo trae los estados que tienen postulaciones', () => {
    const stats = makeStats({ by_status: { applied: 3, interview: 0, offer: 1, rejected: 0 } });
    const { container } = render(
      <StatusFilter value={undefined} onChange={vi.fn()} stats={stats} />,
    );
    const strip = container.querySelector('[aria-hidden="true"]');
    expect(strip?.children).toHaveLength(2);
    expect(strip?.firstElementChild).toHaveStyle({ flexGrow: '3' });
  });

  it('sin estadísticas muestra los botones sin números y sin franja', () => {
    const { container } = render(
      <StatusFilter value={undefined} onChange={vi.fn()} stats={undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Postulado' })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"][class*="strip"]')).toBeNull();
    expect(container).not.toHaveTextContent(/\d/);
  });

  it('sin postulaciones no dibuja la franja y los conteos valen 0', () => {
    const stats = makeStats({
      total: 0,
      by_status: { applied: 0, interview: 0, offer: 0, rejected: 0 },
    });
    const { container } = render(
      <StatusFilter value={undefined} onChange={vi.fn()} stats={stats} />,
    );
    expect(container.querySelector('[class*="strip"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Todas 0' })).toBeInTheDocument();
  });
});
