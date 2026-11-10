import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, isHttpUrl } from './format';

describe('formatDate', () => {
  it('da dd/mm/aaaa a partir del texto, sin pasar por la zona horaria', () => {
    expect(formatDate('2026-09-28')).toBe('28/09/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });

  it('un texto con otra forma se devuelve tal cual', () => {
    expect(formatDate('ayer')).toBe('ayer');
    expect(formatDate('')).toBe('');
  });
});

describe('formatNumber', () => {
  it('usa el formato de México', () => {
    expect(formatNumber(24)).toBe('24');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('isHttpUrl', () => {
  it('acepta http y https', () => {
    expect(isHttpUrl('https://www.occ.com.mx/empleo/1')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hola', 'ftp://example.com', 'example.com', ''])(
    'rechaza %j',
    (value) => {
      expect(isHttpUrl(value)).toBe(false);
    },
  );
});
