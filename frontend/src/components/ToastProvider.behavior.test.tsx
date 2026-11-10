/**
 * Aceptación de la issue #14 sobre el aviso "Postulación guardada" / "Cambios guardados":
 * pausa con el foco, cierre con teclado, StrictMode y texto hostil. Complementa a
 * `ToastProvider.test.tsx`.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFakeTimers as installFakeTimers } from '../test/fakeTimers';
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

function setup(message?: string, strict = false) {
  installFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const tree = (
    <ToastProvider>
      <Trigger message={message} />
    </ToastProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return user;
}

const message = () => screen.queryByText('Postulación guardada');

describe('aviso: tiempo', () => {
  it('dura exactamente 6 segundos', () => {
    expect(TOAST_DURATION_MS).toBe(6000);
  });

  it('un segundo aviso con el mismo texto vuelve a empezar la cuenta de 6 segundos', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(5000));

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(5999));
    expect(message()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(message()).not.toBeInTheDocument();
  });

  it('cerrar a mano y mostrar otro aviso: el temporizador del primero no cierra el segundo', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(4000));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(message()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    act(() => vi.advanceTimersByTime(3000)); // pasan los 6 s del primero
    expect(message()).toBeInTheDocument();
  });
});

describe('aviso: teclado y foco', () => {
  it('"Cerrar" se alcanza con Tab y se activa con Enter', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(message()).not.toBeInTheDocument();
  });

  it('"Cerrar" se activa con la barra espaciadora', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    await user.tab();
    await user.keyboard(' ');

    expect(message()).not.toBeInTheDocument();
  });

  it('con el foco en "Cerrar" el aviso no se cierra solo, y al salir el foco se reanuda la cuenta', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.tab();

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 3));
    expect(message()).toBeInTheDocument();

    await user.tab(); // el foco sale del aviso
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(message()).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(message()).not.toBeInTheDocument();
  });

  it('con el foco dentro, pasar el mouse por encima y quitarlo no reanuda la cuenta', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();

    await user.hover(screen.getByText('Postulación guardada'));
    await user.unhover(screen.getByText('Postulación guardada'));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 2));

    expect(message()).toBeInTheDocument();
  });
});

describe('aviso: render', () => {
  it('en StrictMode el aviso aparece una sola vez y se cierra a los 6 s', async () => {
    const user = setup(undefined, true);
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    expect(screen.getAllByText('Postulación guardada')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(message()).not.toBeInTheDocument();
  });

  it('en StrictMode la región de estado es una sola y existe antes del primer aviso', () => {
    setup(undefined, true);
    const regions = screen.getAllByRole('status');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toBeEmptyDOMElement();
  });

  it('el texto del aviso se muestra como texto, no como HTML', async () => {
    const user = setup('<img src=x onerror="window.__pwned=1"><b>hola</b>');
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));

    expect(
      screen.getByText('<img src=x onerror="window.__pwned=1"><b>hola</b>'),
    ).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('el aviso nuevo reemplaza al anterior: nunca hay dos a la vez', async () => {
    installFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    function Two() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast.show('Postulación guardada')}>Uno</button>
          <button onClick={() => toast.show('Cambios guardados')}>Dos</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Uno' }));
    await user.click(screen.getByRole('button', { name: 'Dos' }));

    expect(screen.queryByText('Postulación guardada')).not.toBeInTheDocument();
    expect(screen.getByText('Cambios guardados')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1);
  });
});
