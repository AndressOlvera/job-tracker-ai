import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  MAX_PAGE,
  MAX_QUERY_LENGTH,
  changeFilters,
  clearFilters,
  describeSort,
  hasActiveFilters,
  isValidIsoDate,
  nextSort,
  normalizeQuery,
  parseListSearch,
  toApiFilters,
  toSearchParams,
  type ListFilters,
} from './filters';

function parse(search: string): ListFilters {
  return parseListSearch(new URLSearchParams(search));
}

describe('parseListSearch', () => {
  it('una URL vacía da los valores por defecto', () => {
    expect(parse('')).toEqual({ sort: '-applied_on', page: 1 });
    expect(parse('')).toEqual(DEFAULT_FILTERS);
  });

  it('lee todos los filtros válidos', () => {
    expect(
      parse(
        'status=interview&q=data&applied_from=2026-09-01&applied_to=2026-09-30&sort=company&page=2',
      ),
    ).toEqual({
      status: 'interview',
      q: 'data',
      applied_from: '2026-09-01',
      applied_to: '2026-09-30',
      sort: 'company',
      page: 2,
    });
  });

  it('decodifica la búsqueda y recorta espacios', () => {
    expect(parse('q=%20%20Becario%20de%20Datos%20').q).toBe('Becario de Datos');
    expect(parse('q=a%26b%25').q).toBe('a&b%');
  });

  describe('ignora lo inválido en lugar de romper', () => {
    it.each([
      ['un estado que no existe', 'status=hired'],
      ['un estado en mayúsculas', 'status=APPLIED'],
      ['un estado vacío', 'status='],
      ['una búsqueda de puros espacios', 'q=%20%20'],
      ['una fecha mal escrita', 'applied_from=01/09/2026&applied_to=ayer'],
      ['una fecha imposible', 'applied_from=2026-02-31&applied_to=2026-13-01'],
      ['una fecha con hora', 'applied_from=2026-09-01T10:00:00'],
      ['una fecha sin ceros', 'applied_from=2026-9-1'],
      ['un orden fuera de la lista', 'sort=password'],
      ['un orden con guion de más', 'sort=--company'],
      ['un parámetro desconocido', 'foo=bar&per_page=500'],
    ])('%s', (_name, search) => {
      expect(parse(search)).toEqual(DEFAULT_FILTERS);
    });

    it.each([
      '0',
      '-1',
      '-3',
      'abc',
      '1.5',
      '2e3',
      ' 2',
      '2 ',
      '',
      '0x10',
      '+2',
      'NaN',
      'Infinity',
    ])('page=%j vale 1', (value) => {
      expect(parse(`page=${encodeURIComponent(value)}`).page).toBe(1);
    });

    it('una página desorbitada vale 1 en lugar de desbordar la base de datos', () => {
      expect(parse(`page=${MAX_PAGE + 1}`).page).toBe(1);
      expect(parse('page=99999999999999999999').page).toBe(1);
      expect(parse(`page=${MAX_PAGE}`).page).toBe(MAX_PAGE);
    });

    it('con basura mezclada conserva solo lo bueno', () => {
      expect(parse('status=offer&q=&applied_from=nope&sort=x&page=-1&utm=1')).toEqual({
        status: 'offer',
        sort: '-applied_on',
        page: 1,
      });
    });

    it('si el mismo parámetro se repite, vale el primero', () => {
      expect(parse('status=offer&status=applied').status).toBe('offer');
    });
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(parse('applied_from=2028-02-29').applied_from).toBe('2028-02-29');
    expect(parse('applied_from=2026-02-29').applied_from).toBeUndefined();
  });

  it('recorta la búsqueda a 100 caracteres', () => {
    expect(parse(`q=${'a'.repeat(150)}`).q).toBe('a'.repeat(MAX_QUERY_LENGTH));
  });

  describe('rango de fechas contradictorio (desde posterior a hasta)', () => {
    it('descarta las dos fechas', () => {
      expect(parse('applied_from=2026-10-01&applied_to=2026-09-01&status=offer')).toEqual({
        status: 'offer',
        sort: '-applied_on',
        page: 1,
      });
    });

    it('un solo día (desde = hasta) es válido', () => {
      const filters = parse('applied_from=2026-09-01&applied_to=2026-09-01');
      expect(filters).toMatchObject({ applied_from: '2026-09-01', applied_to: '2026-09-01' });
    });

    it('si una de las dos es inválida, la otra se queda', () => {
      expect(parse('applied_from=2026-10-01&applied_to=2026-02-31')).toMatchObject({
        applied_from: '2026-10-01',
      });
    });
  });
});

describe('isValidIsoDate', () => {
  it.each(['2026-09-28', '2028-02-29', '0001-01-01', '9999-12-31'])('%s es válida', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each([
    '0000-01-01',
    '2026-02-30',
    '2026-00-10',
    '2026-04-31',
    '0000-00-00',
    '26-09-28',
    '',
    null,
    20260928,
  ])('%j no es válida', (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});

describe('normalizeQuery', () => {
  it('quita los caracteres de control (NUL, tabuladores, saltos de línea)', () => {
    expect(normalizeQuery('a\u0000b')).toBe('ab');
    expect(normalizeQuery('\u0000')).toBe('');
    expect(normalizeQuery('or\tacle\n')).toBe('oracle');
    expect(parse('q=%00').q).toBeUndefined();
  });

  it('recorta por puntos de código: no parte un emoji a la mitad', () => {
    const result = normalizeQuery('a' + '😀'.repeat(150));
    expect(Array.from(result)).toHaveLength(MAX_QUERY_LENGTH);
    expect(result).not.toContain('\uFFFD');
  });

  it('recorta espacios y largo', () => {
    expect(normalizeQuery('  oracle  ')).toBe('oracle');
    expect(normalizeQuery('   ')).toBe('');
    expect(normalizeQuery('a'.repeat(120))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('toSearchParams', () => {
  it('los valores por defecto no se escriben', () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('');
    expect(toSearchParams({ sort: '-applied_on', page: 1 }).toString()).toBe('');
  });

  it('escribe solo lo que no es el valor por defecto, en orden fijo', () => {
    expect(
      toSearchParams({
        page: 3,
        sort: 'company',
        applied_to: '2026-09-30',
        applied_from: '2026-09-01',
        q: 'data',
        status: 'interview',
      }).toString(),
    ).toBe(
      'status=interview&q=data&applied_from=2026-09-01&applied_to=2026-09-30&sort=company&page=3',
    );
  });

  it('codifica la búsqueda', () => {
    expect(toSearchParams({ ...DEFAULT_FILTERS, q: 'a&b 100%' }).get('q')).toBe('a&b 100%');
    expect(toSearchParams({ ...DEFAULT_FILTERS, q: 'a&b' }).toString()).toBe('q=a%26b');
  });

  it('leer lo escrito devuelve lo mismo (ida y vuelta)', () => {
    const filters: ListFilters = {
      status: 'offer',
      q: 'Becario & Datos',
      applied_from: '2026-01-01',
      sort: '-status',
      page: 4,
    };
    expect(parseListSearch(toSearchParams(filters))).toEqual(filters);
  });
});

describe('changeFilters', () => {
  const current: ListFilters = { status: 'offer', q: 'data', sort: 'company', page: 3 };

  it('un cambio de filtro regresa a la página 1', () => {
    expect(changeFilters(current, { status: 'applied' })).toEqual({
      status: 'applied',
      q: 'data',
      sort: 'company',
      page: 1,
    });
    expect(changeFilters(current, { q: 'oracle' }).page).toBe(1);
    expect(changeFilters(current, { sort: '-company' }).page).toBe(1);
    expect(changeFilters(current, { applied_from: '2026-09-01' }).page).toBe(1);
  });

  it('un cambio de página solo cambia la página', () => {
    expect(changeFilters(current, { page: 4 })).toEqual({ ...current, page: 4 });
  });

  it('un valor vacío quita el filtro', () => {
    expect(changeFilters(current, { status: undefined })).not.toHaveProperty('status');
    expect(changeFilters(current, { q: '' })).not.toHaveProperty('q');
    expect(changeFilters(current, { applied_from: '' })).not.toHaveProperty('applied_from');
  });

  it('no modifica los filtros originales', () => {
    const copy = structuredClone(current);
    changeFilters(current, { status: undefined, page: 9 });
    expect(current).toEqual(copy);
  });

  it('un "desde" posterior al "hasta" gana y quita el "hasta"', () => {
    const withRange = { ...DEFAULT_FILTERS, applied_from: '2026-09-01', applied_to: '2026-09-30' };
    const next = changeFilters(withRange, { applied_from: '2026-10-15' });
    expect(next.applied_from).toBe('2026-10-15');
    expect(next).not.toHaveProperty('applied_to');
  });

  it('un "hasta" anterior al "desde" gana y quita el "desde"', () => {
    const withRange = { ...DEFAULT_FILTERS, applied_from: '2026-09-10', applied_to: '2026-09-30' };
    const next = changeFilters(withRange, { applied_to: '2026-08-01' });
    expect(next.applied_to).toBe('2026-08-01');
    expect(next).not.toHaveProperty('applied_from');
  });

  it('un rango válido se conserva', () => {
    const next = changeFilters(
      { ...DEFAULT_FILTERS, applied_from: '2026-09-10' },
      { applied_to: '2026-09-10' },
    );
    expect(next).toMatchObject({ applied_from: '2026-09-10', applied_to: '2026-09-10' });
  });
});

describe('hasActiveFilters y clearFilters', () => {
  it('el orden y la página no cuentan como filtros', () => {
    expect(hasActiveFilters({ sort: 'company', page: 5 })).toBe(false);
  });

  it.each<[string, Partial<ListFilters>]>([
    ['estado', { status: 'offer' }],
    ['búsqueda', { q: 'x' }],
    ['desde', { applied_from: '2026-09-01' }],
    ['hasta', { applied_to: '2026-09-01' }],
  ])('%s es un filtro activo', (_name, extra) => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, ...extra })).toBe(true);
  });

  it('limpiar conserva el orden y vuelve a la página 1', () => {
    expect(
      clearFilters({
        status: 'offer',
        q: 'x',
        applied_from: '2026-09-01',
        sort: '-status',
        page: 3,
      }),
    ).toEqual({ sort: '-status', page: 1 });
  });
});

describe('toApiFilters', () => {
  it('manda siempre orden, página y 20 por página', () => {
    expect(toApiFilters(DEFAULT_FILTERS)).toEqual({ sort: '-applied_on', page: 1, per_page: 20 });
    expect(toApiFilters({ status: 'offer', sort: 'company', page: 2 })).toEqual({
      status: 'offer',
      sort: 'company',
      page: 2,
      per_page: 20,
    });
  });
});

describe('orden por columna', () => {
  it('describe el campo y la dirección', () => {
    expect(describeSort('-applied_on')).toEqual({ field: 'applied_on', direction: 'desc' });
    expect(describeSort('company')).toEqual({ field: 'company', direction: 'asc' });
  });

  it('una columna nueva empieza en su dirección natural', () => {
    expect(nextSort('-applied_on', 'company')).toBe('company');
    expect(nextSort('-applied_on', 'status')).toBe('status');
    expect(nextSort('company', 'applied_on')).toBe('-applied_on');
  });

  it('la misma columna invierte la dirección', () => {
    expect(nextSort('company', 'company')).toBe('-company');
    expect(nextSort('-company', 'company')).toBe('company');
    expect(nextSort('-applied_on', 'applied_on')).toBe('applied_on');
    expect(nextSort('applied_on', 'applied_on')).toBe('-applied_on');
  });

  it('desde un orden que no tiene columna (created_at) cualquier encabezado empieza de cero', () => {
    expect(nextSort('-created_at', 'company')).toBe('company');
    expect(nextSort('created_at', 'applied_on')).toBe('-applied_on');
  });
});
