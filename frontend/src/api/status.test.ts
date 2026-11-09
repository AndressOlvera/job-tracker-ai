import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES, STATUS_LABELS, isApplicationStatus } from './status';

describe('estados de una postulación', () => {
  // ADR-003: los valores se repiten en la BD, la API y el frontend; esta prueba avisa si cambian.
  it('son los cuatro de la API, en el orden del proceso', () => {
    expect(APPLICATION_STATUSES).toEqual(['applied', 'interview', 'offer', 'rejected']);
  });

  it('tienen su etiqueta en español (docs/01-requisitos.md)', () => {
    expect(STATUS_LABELS).toEqual({
      applied: 'Postulado',
      interview: 'Entrevista',
      offer: 'Oferta',
      rejected: 'Rechazado',
    });
  });

  it.each(APPLICATION_STATUSES)('reconoce `%s` como estado válido', (status) => {
    expect(isApplicationStatus(status)).toBe(true);
  });

  it.each([['Interview'], ['postulado'], [''], [undefined], [null], [1]])('rechaza %j', (value) => {
    expect(isApplicationStatus(value)).toBe(false);
  });
});
