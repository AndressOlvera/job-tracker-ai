import { describe, expect, it } from 'vitest';
import { parseApplicationId } from './applicationId';

describe('parseApplicationId', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['9007199254740991', 9007199254740991],
  ])('acepta el entero positivo %s', (text, expected) => {
    expect(parseApplicationId(text)).toBe(expected);
  });

  it.each([
    'abc',
    '0',
    '-1',
    '1.5',
    '1e3',
    '2 ',
    ' 2',
    '',
    '01',
    '+3',
    '0x10',
    'NaN',
    '99999999999999999999',
  ])('rechaza %j', (text) => {
    expect(parseApplicationId(text)).toBeUndefined();
  });
});
