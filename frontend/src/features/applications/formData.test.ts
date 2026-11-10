import { describe, expect, it } from 'vitest';
import { makeApplication } from '../../test/api';
import {
  buildCreateInput,
  buildPatch,
  changedFields,
  emptyValues,
  mapApiErrors,
  valuesFromApplication,
} from './formData';
import type { FormValues } from './validation';

describe('emptyValues', () => {
  it('empieza en Postulado y con la fecha de hoy', () => {
    expect(emptyValues('2026-10-03')).toEqual({
      company: '',
      position: '',
      status: 'applied',
      applied_on: '2026-10-03',
      job_url: '',
      source: '',
      notes: '',
    });
  });
});

describe('valuesFromApplication', () => {
  it('copia los campos y convierte null en campo vacío', () => {
    const values = valuesFromApplication(
      makeApplication({ job_url: null, source: null, notes: null }),
    );
    expect(values).toMatchObject({ job_url: '', source: '', notes: '' });
    expect(values.company).toBe('Oracle');
    expect(values.applied_on).toBe('2026-09-28');
  });
});

describe('buildCreateInput', () => {
  it('recorta los textos y omite los opcionales vacíos', () => {
    const input = buildCreateInput({
      ...emptyValues('2026-10-03'),
      company: '  Oracle ',
      position: ' Becario ',
      source: '   ',
    });
    expect(input).toEqual({
      company: 'Oracle',
      position: 'Becario',
      status: 'applied',
      applied_on: '2026-10-03',
    });
  });

  it('manda los opcionales escritos, recortados', () => {
    const input = buildCreateInput({
      ...emptyValues('2026-10-03'),
      company: 'Oracle',
      position: 'Becario',
      status: 'interview',
      job_url: ' https://example.com ',
      source: ' OCC ',
      notes: ' hola ',
    });
    expect(input).toEqual({
      company: 'Oracle',
      position: 'Becario',
      status: 'interview',
      applied_on: '2026-10-03',
      job_url: 'https://example.com',
      source: 'OCC',
      notes: 'hola',
    });
  });
});

describe('buildPatch', () => {
  const original = makeApplication();
  const same = valuesFromApplication(original);

  it('sin cambios devuelve {}', () => {
    expect(buildPatch(same, original)).toEqual({});
    expect(changedFields(same, original)).toEqual([]);
  });

  it('espacios alrededor no cuentan como cambio', () => {
    expect(
      buildPatch(
        { ...same, company: ` ${original.company} `, notes: ` ${original.notes} ` },
        original,
      ),
    ).toEqual({});
  });

  it('manda solo lo que cambió', () => {
    const values: FormValues = { ...same, status: 'offer', company: ' Intel ' };
    expect(buildPatch(values, original)).toEqual({ status: 'offer', company: 'Intel' });
  });

  it('vaciar un opcional manda null', () => {
    const values: FormValues = { ...same, job_url: '', source: '   ', notes: '' };
    expect(buildPatch(values, original)).toEqual({ job_url: null, source: null, notes: null });
  });

  it('un opcional que ya era null y sigue vacío no cuenta', () => {
    const empty = makeApplication({ job_url: null, source: null, notes: null });
    expect(buildPatch(valuesFromApplication(empty), empty)).toEqual({});
  });

  it('llenar un opcional que era null manda el texto', () => {
    const empty = makeApplication({ notes: null });
    expect(buildPatch({ ...valuesFromApplication(empty), notes: ' Nota ' }, empty)).toEqual({
      notes: 'Nota',
    });
  });

  it('manda la fecha si cambió', () => {
    expect(buildPatch({ ...same, applied_on: '2026-09-01' }, original)).toEqual({
      applied_on: '2026-09-01',
    });
  });
});

describe('mapApiErrors', () => {
  it('reparte los mensajes por campo, tal cual', () => {
    const { fields, general } = mapApiErrors(
      { company: ['Este campo es obligatorio.'], applied_on: ['La fecha no puede ser futura.'] },
      'Algunos campos no son válidos.',
    );
    expect(fields).toEqual({
      company: 'Este campo es obligatorio.',
      applied_on: 'La fecha no puede ser futura.',
    });
    expect(general).toEqual([]);
  });

  it('une varios mensajes de un mismo campo', () => {
    const { fields } = mapApiErrors({ source: ['Uno.', 'Dos.'] }, 'x');
    expect(fields.source).toBe('Uno. Dos.');
  });

  it('manda body y las llaves desconocidas al aviso general', () => {
    const { fields, general } = mapApiErrors(
      { body: ['Envía al menos un campo.'], id: ['No se puede enviar.'], notes: ['Muy largo.'] },
      'x',
    );
    expect(fields).toEqual({ notes: 'Muy largo.' });
    expect(general).toEqual(['Envía al menos un campo.', 'No se puede enviar.']);
  });

  it('sin detalles usa el mensaje de la API como aviso general', () => {
    expect(mapApiErrors(undefined, 'Algunos campos no son válidos.')).toEqual({
      fields: {},
      general: ['Algunos campos no son válidos.'],
    });
    expect(mapApiErrors({}, 'Mensaje').general).toEqual(['Mensaje']);
  });

  it('un texto suelto cuenta como un solo mensaje', () => {
    const { fields, general } = mapApiErrors(
      { company: 'Texto suelto.', extra: 'Otro.' } as never,
      'Mensaje',
    );
    expect(fields).toEqual({ company: 'Texto suelto.' });
    expect(general).toEqual(['Otro.']);
  });

  it.each([
    ['un número', 5],
    ['un objeto', { a: 1 }],
    ['null', null],
    ['una lista sin texto', [1, { a: 1 }]],
  ])('%s en una llave va al aviso general con el mensaje de la API', (_name, value) => {
    const { fields, general } = mapApiErrors(
      { company: value, notes: ['Muy largo.'] } as never,
      'Mensaje',
    );
    expect(fields).toEqual({ notes: 'Muy largo.' });
    expect(general).toEqual(['Mensaje']);
  });

  it('ignora los elementos que no son texto de una lista', () => {
    const { fields } = mapApiErrors({ source: ['Uno.', 7, null] } as never, 'x');
    expect(fields).toEqual({ source: 'Uno.' });
  });

  it('details que no es un objeto se trata como sin detalles', () => {
    expect(mapApiErrors('texto' as never, 'Mensaje')).toEqual({ fields: {}, general: ['Mensaje'] });
    expect(mapApiErrors(null as never, 'Mensaje')).toEqual({ fields: {}, general: ['Mensaje'] });
  });
});
