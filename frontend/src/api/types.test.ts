import { describe, expect, it } from 'vitest';
import { APPLICATION_SORTS, SORT_FIELDS, isApplicationSort } from './types';

describe('orden de la lista', () => {
  it('acepta los cuatro campos de docs/03-api.md', () => {
    expect(SORT_FIELDS).toEqual(['applied_on', 'company', 'status', 'created_at']);
  });

  it('tiene los 8 valores de `sort`: cada campo ascendente y descendente', () => {
    expect(APPLICATION_SORTS).toEqual([
      'applied_on',
      '-applied_on',
      'company',
      '-company',
      'status',
      '-status',
      'created_at',
      '-created_at',
    ]);
  });

  it.each(APPLICATION_SORTS)('reconoce `%s`', (sort) => {
    expect(isApplicationSort(sort)).toBe(true);
  });

  it.each([['position'], ['--company'], ['+company'], [''], [undefined], [null]])(
    'rechaza %j',
    (value) => {
      expect(isApplicationSort(value)).toBe(false);
    },
  );
});
