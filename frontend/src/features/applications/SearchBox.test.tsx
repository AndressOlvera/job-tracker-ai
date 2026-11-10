import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFakeTimers } from '../../test/fakeTimers';
import { MAX_QUERY_LENGTH } from './filters';
import { SEARCH_DEBOUNCE_MS, SearchBox } from './SearchBox';

describe('SearchBox', () => {
  beforeEach(() => {
    useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(value = '') {
    const onSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<SearchBox value={value} onSearch={onSearch} />);
    const input = screen.getByLabelText('Buscar');
    return { onSearch, user, input, ...view };
  }

  it('tiene etiqueta visible, placeholder y largo máximo', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('placeholder', 'Empresa o puesto');
    expect(input).toHaveAttribute('maxlength', String(MAX_QUERY_LENGTH));
  });

  it('empieza con lo que dice la URL', () => {
    expect(setup('oracle').input).toHaveValue('oracle');
  });

  it(`aplica la búsqueda ${SEARCH_DEBOUNCE_MS} ms después de dejar de escribir`, async () => {
    const { user, input, onSearch } = setup();
    await user.type(input, 'data');
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('data');
  });

  it('cada tecla reinicia la espera: una sola búsqueda por ráfaga', async () => {
    const { user, input, onSearch } = setup();
    await user.type(input, 'da');
    act(() => vi.advanceTimersByTime(200));
    await user.type(input, 'ta');
    act(() => vi.advanceTimersByTime(200));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('data');
  });

  it('manda el texto sin espacios sobrantes y no repite lo que ya aplicó', async () => {
    const { user, input, onSearch } = setup('data');
    await user.type(input, '  ');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).not.toHaveBeenCalled();
    expect(input).toHaveValue('data  ');
  });

  it('borrar todo aplica una búsqueda vacía', async () => {
    const { user, input, onSearch } = setup('data');
    await user.clear(input);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('');
  });

  it('no pierde el texto ni el foco cuando la URL se actualiza con lo que escribió', async () => {
    const { user, input, onSearch, rerender } = setup();
    await user.type(input, 'da');
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenCalledWith('da');

    // La URL ya trae "da" y el usuario sigue escribiendo.
    rerender(<SearchBox value="da" onSearch={onSearch} />);
    await user.type(input, 'ta');
    rerender(<SearchBox value="da" onSearch={onSearch} />);
    expect(input).toHaveValue('data');
    expect(input).toHaveFocus();
  });

  it('se sincroniza cuando la URL cambia por otro lado (atrás, "Limpiar filtros")', () => {
    const { input, rerender, onSearch } = setup('oracle');
    rerender(<SearchBox value="" onSearch={onSearch} />);
    expect(input).toHaveValue('');
    rerender(<SearchBox value="intel" onSearch={onSearch} />);
    expect(input).toHaveValue('intel');
  });

  it('un cambio externo cancela la búsqueda que estaba por aplicarse', async () => {
    const { user, input, onSearch, rerender } = setup('oracle');
    await user.type(input, 'x');
    rerender(<SearchBox value="" onSearch={onSearch} />);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('al desmontarse cancela la búsqueda pendiente', async () => {
    const { user, input, onSearch, unmount } = setup();
    await user.type(input, 'x');
    unmount();
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('usa el callback más reciente cuando vence la espera', async () => {
    const { user, input, rerender } = setup();
    await user.type(input, 'x');
    const latest = vi.fn();
    rerender(<SearchBox value="" onSearch={latest} />);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(latest).toHaveBeenCalledExactlyOnceWith('x');
  });
});
