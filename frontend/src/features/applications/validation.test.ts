import { describe, expect, it } from 'vitest';
import {
  countCharacters,
  firstInvalidField,
  FUTURE_DATE_MESSAGE,
  INVALID_DATE_MESSAGE,
  INVALID_STATUS_MESSAGE,
  INVALID_URL_MESSAGE,
  isFormField,
  isRealDate,
  MAX_LENGTH,
  maxLengthMessage,
  REQUIRED_MESSAGE,
  validateField,
  validateForm,
  type FormValues,
} from './validation';

const TODAY = '2026-10-03';

function valid(overrides: Partial<FormValues> = {}): FormValues {
  return {
    company: 'Oracle',
    position: 'Becario de Software',
    status: 'applied',
    applied_on: TODAY,
    job_url: '',
    source: '',
    notes: '',
    ...overrides,
  };
}

describe('empresa y puesto', () => {
  it.each(['company', 'position'] as const)('%s es obligatorio', (field) => {
    expect(validateField(field, '', TODAY)).toBe(REQUIRED_MESSAGE);
    expect(validateField(field, '   \t ', TODAY)).toBe(REQUIRED_MESSAGE);
  });

  it.each(['company', 'position'] as const)(
    '%s acepta hasta 120 caracteres recortados',
    (field) => {
      expect(validateField(field, `  ${'a'.repeat(120)}  `, TODAY)).toBeUndefined();
      expect(validateField(field, 'a'.repeat(121), TODAY)).toBe('Máximo 120 caracteres.');
    },
  );
});

describe('estado', () => {
  it.each(['applied', 'interview', 'offer', 'rejected'])('acepta %s', (status) => {
    expect(validateField('status', status, TODAY)).toBeUndefined();
  });

  it.each(['', 'Postulado', 'hired'])('rechaza %j', (status) => {
    expect(validateField('status', status, TODAY)).toBe(INVALID_STATUS_MESSAGE);
  });
});

describe('fecha de postulación', () => {
  it('es obligatoria', () => {
    expect(validateField('applied_on', '', TODAY)).toBe(REQUIRED_MESSAGE);
  });

  it('acepta hoy y días pasados', () => {
    expect(validateField('applied_on', TODAY, TODAY)).toBeUndefined();
    expect(validateField('applied_on', '2026-10-02', TODAY)).toBeUndefined();
    expect(validateField('applied_on', '2025-12-31', TODAY)).toBeUndefined();
  });

  it('rechaza una fecha futura', () => {
    expect(validateField('applied_on', '2026-10-04', TODAY)).toBe(FUTURE_DATE_MESSAGE);
    expect(validateField('applied_on', '2027-01-01', TODAY)).toBe(FUTURE_DATE_MESSAGE);
  });

  it.each([
    '2026-02-31',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-10-3',
    '03/10/2026',
    'hoy',
  ])('rechaza la fecha inexistente o mal escrita %j', (value) => {
    expect(validateField('applied_on', value, TODAY)).toBe(INVALID_DATE_MESSAGE);
  });
});

describe('isRealDate', () => {
  it('conoce los años bisiestos', () => {
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('1900-02-29')).toBe(false);
    expect(isRealDate('2000-02-29')).toBe(true);
  });

  it('conoce los días de cada mes', () => {
    expect(isRealDate('2026-01-31')).toBe(true);
    expect(isRealDate('2026-06-31')).toBe(false);
    expect(isRealDate('2026-06-30')).toBe(true);
    expect(isRealDate('0000-01-01')).toBe(false);
  });
});

describe('enlace de la vacante', () => {
  it('es opcional', () => {
    expect(validateField('job_url', '', TODAY)).toBeUndefined();
    expect(validateField('job_url', '   ', TODAY)).toBeUndefined();
  });

  it.each([
    'https://www.occ.com.mx/empleo/oferta/12345',
    'http://localhost:5173/x?y=1#z',
    '  https://example.com  ',
    'HTTPS://EXAMPLE.COM',
  ])('acepta %j', (value) => {
    expect(validateField('job_url', value, TODAY)).toBeUndefined();
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'ftp://example.com/archivo',
    'data:text/html,hola',
    'example.com',
    'www.example.com',
    'https://',
    'http:ejemplo',
    'https://exa mple.com',
    'mailto:a@b.com',
  ])('rechaza %j', (value) => {
    expect(validateField('job_url', value, TODAY)).toBe(INVALID_URL_MESSAGE);
  });

  it('acepta hasta 500 caracteres', () => {
    const prefix = 'https://example.com/';
    expect(
      validateField('job_url', prefix + 'a'.repeat(500 - prefix.length), TODAY),
    ).toBeUndefined();
    expect(validateField('job_url', prefix + 'a'.repeat(501 - prefix.length), TODAY)).toBe(
      'Máximo 500 caracteres.',
    );
  });
});

describe('fuente y notas', () => {
  it('son opcionales', () => {
    expect(validateField('source', '', TODAY)).toBeUndefined();
    expect(validateField('notes', '  ', TODAY)).toBeUndefined();
  });

  it('respetan sus máximos', () => {
    expect(validateField('source', 'a'.repeat(60), TODAY)).toBeUndefined();
    expect(validateField('source', 'a'.repeat(61), TODAY)).toBe('Máximo 60 caracteres.');
    expect(validateField('notes', 'a'.repeat(5000), TODAY)).toBeUndefined();
    expect(validateField('notes', 'a'.repeat(5001), TODAY)).toBe('Máximo 5000 caracteres.');
  });
});

describe('conteo de caracteres', () => {
  it('cuenta un emoji como un carácter, como la API', () => {
    expect(countCharacters('a😀b')).toBe(3);
    expect(validateField('source', '😀'.repeat(60), TODAY)).toBeUndefined();
  });
});

describe('validateForm', () => {
  it('no da errores con un formulario válido', () => {
    expect(validateForm(valid(), TODAY)).toEqual({});
  });

  it('junta los errores de todos los campos', () => {
    const errors = validateForm(
      valid({ company: ' ', position: '', applied_on: '2027-01-01', job_url: 'ftp://x' }),
      TODAY,
    );
    expect(errors).toEqual({
      company: REQUIRED_MESSAGE,
      position: REQUIRED_MESSAGE,
      applied_on: FUTURE_DATE_MESSAGE,
      job_url: INVALID_URL_MESSAGE,
    });
  });

  it('puede revisar solo algunos campos', () => {
    const values = valid({ company: '', notes: 'a'.repeat(5001) });
    expect(validateForm(values, TODAY, ['notes'])).toEqual({ notes: maxLengthMessage(5000) });
    expect(validateForm(values, TODAY, [])).toEqual({});
  });
});

describe('firstInvalidField', () => {
  it('sigue el orden visual, no el de las llaves', () => {
    expect(firstInvalidField({ notes: 'x', job_url: 'x', position: 'x' })).toBe('position');
    expect(firstInvalidField({ source: 'x', applied_on: 'x' })).toBe('applied_on');
  });

  it('sin errores no hay campo', () => {
    expect(firstInvalidField({})).toBeUndefined();
  });
});

describe('isFormField', () => {
  it('reconoce los siete campos y nada más', () => {
    for (const field of [
      'company',
      'position',
      'status',
      'applied_on',
      'job_url',
      'source',
      'notes',
    ]) {
      expect(isFormField(field)).toBe(true);
    }
    expect(isFormField('body')).toBe(false);
    expect(isFormField('id')).toBe(false);
  });
});

it('los máximos son los de docs/03-api.md', () => {
  expect(MAX_LENGTH).toEqual({
    company: 120,
    position: 120,
    job_url: 500,
    source: 60,
    notes: 5000,
  });
});
