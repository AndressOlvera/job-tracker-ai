/**
 * Bordes de HU-01 que `validation.test.ts` no cubre (issue #14): 120 contra 121 caracteres
 * después de recortar, emoji y caracteres combinados (la API cuenta puntos de código),
 * espacios de todo tipo, saltos de línea y los bordes de la URL.
 */
import { describe, expect, it } from 'vitest';
import {
  INVALID_URL_MESSAGE,
  REQUIRED_MESSAGE,
  validateField,
  validateForm,
  type FormValues,
} from './validation';

const TODAY = '2026-10-03';
const TOO_LONG_120 = 'Máximo 120 caracteres.';

describe('empresa y puesto: 120 contra 121 después de recortar', () => {
  it.each(['company', 'position'] as const)('%s acepta 120 y rechaza 121', (field) => {
    expect(validateField(field, 'a'.repeat(120), TODAY)).toBeUndefined();
    expect(validateField(field, 'a'.repeat(121), TODAY)).toBe(TOO_LONG_120);
  });

  it.each(['company', 'position'] as const)(
    '%s cuenta el texto ya recortado: 120 letras con espacios alrededor son válidas',
    (field) => {
      expect(validateField(field, `   ${'a'.repeat(120)}   `, TODAY)).toBeUndefined();
      expect(validateField(field, `\t${'a'.repeat(121)}\n`, TODAY)).toBe(TOO_LONG_120);
    },
  );

  it('los espacios del interior sí cuentan', () => {
    expect(validateField('company', `${'a'.repeat(60)} ${'b'.repeat(59)}`, TODAY)).toBeUndefined();
    expect(validateField('company', `${'a'.repeat(60)} ${'b'.repeat(60)}`, TODAY)).toBe(
      TOO_LONG_120,
    );
  });

  it('un emoji vale un carácter (120 emoji sí, 121 no)', () => {
    expect(validateField('company', '😀'.repeat(120), TODAY)).toBeUndefined();
    expect(validateField('company', '😀'.repeat(121), TODAY)).toBe(TOO_LONG_120);
    // Emoji fuera del plano básico (dos unidades UTF-16) en el puesto.
    expect(validateField('position', '𝒳'.repeat(120), TODAY)).toBeUndefined();
    expect(validateField('position', '𝒳'.repeat(121), TODAY)).toBe(TOO_LONG_120);
  });

  it('un emoji con modificadores cuenta todos sus puntos de código, como len() en Python', () => {
    // 👍🏽 = 2 puntos de código; la familia 👨‍👩‍👧 = 5 (3 emoji y 2 uniones).
    expect(validateField('company', '👍🏽'.repeat(60), TODAY)).toBeUndefined();
    expect(validateField('company', '👍🏽'.repeat(61), TODAY)).toBe(TOO_LONG_120);
    expect(validateField('company', '👨‍👩‍👧'.repeat(24), TODAY)).toBeUndefined(); // 120
    expect(validateField('company', '👨‍👩‍👧'.repeat(25), TODAY)).toBe(TOO_LONG_120); // 125
  });

  it('un carácter combinado (e + acento) cuenta dos puntos de código; el precompuesto, uno', () => {
    const decomposed = 'é'; // é en dos puntos de código
    const precomposed = 'é';
    expect(validateField('company', decomposed.repeat(60), TODAY)).toBeUndefined();
    expect(validateField('company', decomposed.repeat(61), TODAY)).toBe(TOO_LONG_120);
    expect(validateField('company', precomposed.repeat(120), TODAY)).toBeUndefined();
    expect(validateField('company', precomposed.repeat(121), TODAY)).toBe(TOO_LONG_120);
  });

  it.each([' ', '   ', '\t', '\n', '\r\n', ' \t \n ', ' ', '　', ' '])(
    'solo espacios en blanco (%j) es lo mismo que vacío',
    (blank) => {
      expect(validateField('company', blank, TODAY)).toBe(REQUIRED_MESSAGE);
      expect(validateField('position', blank, TODAY)).toBe(REQUIRED_MESSAGE);
    },
  );

  it('un salto de línea o tabulador al inicio o al final no invalida el valor', () => {
    expect(validateField('company', '\nOracle\n', TODAY)).toBeUndefined();
    expect(validateField('company', '\tOracle\t', TODAY)).toBeUndefined();
  });

  it('un salto de línea dentro de la empresa no se rechaza (el spec no lo prohíbe)', () => {
    // El campo es un <input>, que en el navegador descarta los saltos al escribir o pegar;
    // la función no los toca. Se documenta el comportamiento para que un cambio sea deliberado.
    expect(validateField('company', 'Ora\ncle', TODAY)).toBeUndefined();
  });
});

describe('fuente y notas: bordes con recorte y emoji', () => {
  it('la fuente cuenta el texto recortado (60 sí, 61 no)', () => {
    expect(validateField('source', `  ${'a'.repeat(60)}  `, TODAY)).toBeUndefined();
    expect(validateField('source', `  ${'a'.repeat(61)}  `, TODAY)).toBe('Máximo 60 caracteres.');
    expect(validateField('source', '😀'.repeat(61), TODAY)).toBe('Máximo 60 caracteres.');
  });

  it('las notas aceptan 5000 y rechazan 5001, también después de recortar y con emoji', () => {
    expect(validateField('notes', `\n${'a'.repeat(5000)}\n`, TODAY)).toBeUndefined();
    expect(validateField('notes', `\n${'a'.repeat(5001)}\n`, TODAY)).toBe(
      'Máximo 5000 caracteres.',
    );
    expect(validateField('notes', '😀'.repeat(5000), TODAY)).toBeUndefined();
    expect(validateField('notes', '😀'.repeat(5001), TODAY)).toBe('Máximo 5000 caracteres.');
  });

  it('las notas conservan los saltos de línea del interior', () => {
    expect(validateField('notes', 'uno\n\ndos\n\ntres', TODAY)).toBeUndefined();
  });
});

describe('enlace de la vacante: bordes', () => {
  const prefix = 'https://example.com/';

  it('500 sí y 501 no, contados después de recortar', () => {
    expect(
      validateField('job_url', `  ${prefix}${'a'.repeat(500 - prefix.length)}  `, TODAY),
    ).toBeUndefined();
    expect(validateField('job_url', `  ${prefix}${'a'.repeat(501 - prefix.length)}  `, TODAY)).toBe(
      'Máximo 500 caracteres.',
    );
  });

  it('una URL larguísima da el error de largo, no el de formato', () => {
    expect(validateField('job_url', `${prefix}${'a'.repeat(5000)}`, TODAY)).toBe(
      'Máximo 500 caracteres.',
    );
  });

  it.each(['HTTP://EXAMPLE.COM', 'Http://Example.com/Ruta', 'HTTPS://MAYÚSCULAS.COM'])(
    'el esquema en mayúsculas se acepta (%j)',
    (value) => {
      expect(validateField('job_url', value, TODAY)).toBeUndefined();
    },
  );

  it.each([
    'http://',
    'HTTP://',
    'https://   ',
    '//x.com',
    '//example.com/ruta',
    'https:/example.com',
    'https:example.com',
    'https:\\\\example.com',
    'https://exa mple.com',
    'https://example.com/a b',
    'https://example.com\n/otra',
    'https://exa\tmple.com',
    'ftp://example.com',
    'file:///etc/passwd',
    'javascript://example.com/%0Aalert(1)',
    ' javascript:alert(1)',
    'http //example.com',
    'http://[::1',
  ])('rechaza %j', (value) => {
    expect(validateField('job_url', value, TODAY)).toBe(INVALID_URL_MESSAGE);
  });

  it.each([
    'https://user:pass@host',
    'https://user:pass@example.com:8443/ruta?x=1#frag',
    'http://localhost',
    'http://127.0.0.1:5000/x',
    'http://[::1]:5173/',
    'https://ejemplo.mx/ruta/con%20espacio',
    'https://example.com/ñandú',
  ])('acepta %j (sintaxis de URL válida con http o https)', (value) => {
    expect(validateField('job_url', value, TODAY)).toBeUndefined();
  });
});

describe('estado y fecha: bordes', () => {
  it.each(['Applied', 'APPLIED', ' applied', 'applied '])(
    'el estado %j no es uno de los cuatro',
    (v) => {
      expect(validateField('status', v, TODAY)).toBe('Elige un estado válido.');
    },
  );

  it.each(['2026-10-3', '26-10-03', '2026/10/03', '03/10/2026', '2026-10-03T00:00', '2026-1-03'])(
    'rechaza la fecha mal escrita %j',
    (value) => {
      expect(validateField('applied_on', value, TODAY)).toBe('Escribe una fecha válida.');
    },
  );

  it('compara contra "hoy" aunque cambie el año o sea 29 de febrero', () => {
    expect(validateField('applied_on', '2028-02-29', '2028-02-29')).toBeUndefined();
    expect(validateField('applied_on', '2028-03-01', '2028-02-29')).toBe(
      'La fecha no puede ser futura.',
    );
    expect(validateField('applied_on', '2027-01-01', '2026-12-31')).toBe(
      'La fecha no puede ser futura.',
    );
    expect(validateField('applied_on', '2026-12-31', '2027-01-01')).toBeUndefined();
    expect(validateField('applied_on', '2027-02-29', '2027-03-01')).toBe(
      'Escribe una fecha válida.',
    );
  });
});

describe('validateForm: un formulario con todos los máximos exactos es válido', () => {
  it('120/120/500/60/5000', () => {
    const values: FormValues = {
      company: 'a'.repeat(120),
      position: 'b'.repeat(120),
      status: 'offer',
      applied_on: TODAY,
      job_url: `https://example.com/${'c'.repeat(480)}`,
      source: 'd'.repeat(60),
      notes: 'e'.repeat(5000),
    };
    expect(values.job_url).toHaveLength(500);
    expect(validateForm(values, TODAY)).toEqual({});
  });
});
