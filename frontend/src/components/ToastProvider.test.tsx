import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useFakeTimers } from '../test/fakeTimers';
import { TOAST_DURATION_MS, ToastProvider } from './ToastProvider';
import { useToast } from './toastContext';

function Trigger({ message = 'Postulación guardada' }: { message?: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(message)}>
      Mostrar
    </button>
  );
}

function renderToast() {
  return render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  it('tiene una región de estado vacía desde el inicio, para que se anuncie el aviso', () => {
    renderToast();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('muestra el aviso dentro de la región de estado', async () => {
    renderToast();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Postulación guardada');
  });

  it('se cierra con el botón Cerrar', async () => {
    renderToast();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByText('Postulación guardada')).not.toBeInTheDocument();
  });

  it('se cierra solo a los pocos segundos', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToast();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(screen.getByText('Postulación guardada')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Postulación guardada')).not.toBeInTheDocument();
  });

  it('no se cierra mientras el mouse está encima y se reanuda al salir', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToast();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    await user.hover(screen.getByText('Postulación guardada'));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 3));
    expect(screen.getByText('Postulación guardada')).toBeInTheDocument();

    await user.unhover(screen.getByText('Postulación guardada'));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.queryByText('Postulación guardada')).not.toBeInTheDocument();
  });

  it('un aviso nuevo reemplaza al anterior y reinicia el tiempo', async () => {
    useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToast();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1000));

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1000));

    expect(screen.getAllByText('Postulación guardada')).toHaveLength(1);
  });

  it('useToast fuera del proveedor da un error claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('useToast debe usarse dentro de <ToastProvider>.');
  });
});
