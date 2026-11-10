import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, getReturnTo, listReturnState } from './listLocation';

describe('listReturnState', () => {
  it('guarda la ruta y la búsqueda de la lista', () => {
    expect(listReturnState({ pathname: '/', search: '?status=offer&page=2' })).toEqual({
      returnTo: '/?status=offer&page=2',
    });
    expect(listReturnState({ pathname: '/', search: '' })).toEqual({ returnTo: '/' });
  });
});

describe('getReturnTo', () => {
  it('lee lo que guardó la lista', () => {
    const state = listReturnState({ pathname: '/', search: '?q=data' });
    expect(getReturnTo(state)).toBe('/?q=data');
  });

  it.each([null, undefined, 'texto', 42, {}, { returnTo: 7 }, { returnTo: null }])(
    'sin un returnTo válido (%j) vuelve a la lista sin filtros',
    (state) => {
      expect(getReturnTo(state)).toBe(DEFAULT_RETURN_TO);
    },
  );

  it.each([
    'https://malo.example',
    '//malo.example',
    '/\\malo.example',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    '/\u0000/evil.com',
    'stats',
    'javascript:alert(1)',
  ])('no acepta destinos fuera de la app (%s)', (returnTo) => {
    expect(getReturnTo({ returnTo })).toBe(DEFAULT_RETURN_TO);
  });
});
