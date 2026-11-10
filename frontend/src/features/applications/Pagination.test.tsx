import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('no se muestra con una sola página (o ninguna)', () => {
    const { rerender } = render(<Pagination page={1} pages={1} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    rerender(<Pagination page={1} pages={0} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('muestra "Página X de Y" y deshabilita Anterior en la primera página', () => {
    render(<Pagination page={1} pages={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('deshabilita Siguiente en la última página', () => {
    render(<Pagination page={3} pages={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('pide la página anterior y la siguiente', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pages={3} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('si el botón pulsado queda deshabilitado, el foco pasa al otro', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [page, setPage] = useState(1);
      return <Pagination page={page} pages={2} onPageChange={setPage} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus();
  });

  it('al cargar no roba el foco', () => {
    render(<Pagination page={1} pages={2} onPageChange={vi.fn()} />);
    expect(document.body).toHaveFocus();
  });
});
