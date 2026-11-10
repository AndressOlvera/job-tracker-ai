/**
 * Aceptación de la issue #13: las fechas de calendario (`YYYY-MM-DD`) no se desfasan un día sin
 * importar la zona horaria del proceso (ADR-009, ADR-017). El riesgo es `new Date('2026-01-01')`, que
 * se interpreta como UTC y en México (UTC-6) cae el 31 de diciembre; en Kiritimati (UTC+14) pasa lo
 * contrario con el 31 de diciembre. Cada zona se prueba en un proceso con `TZ` cambiado en caliente.
 */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, makeApplication, makeApplicationList } from '../../test/api';
import { bodyRows, findTable, stubApi } from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';
import { isValidIsoDate } from './filters';
import { formatDate } from './format';

// Desfase (minutos al oeste de UTC) esperado el 1 de enero y el 31 de diciembre de 2026.
const ZONES = [
  { tz: 'America/Mexico_City', offset: 360 },
  { tz: 'Pacific/Kiritimati', offset: -840 },
  { tz: 'UTC', offset: 0 },
  { tz: 'Pacific/Pago_Pago', offset: 660 }, // UTC-11: el extremo oeste
] as const;

const originalTz = process.env.TZ;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe.each(ZONES)('zona horaria $tz', ({ tz, offset }) => {
  beforeEach(() => {
    process.env.TZ = tz;
    // Si Node no aplicó la zona, las pruebas pasarían sin probar nada: se comprueba aquí.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(offset);
    expect(new Date(2026, 11, 31).getTimezoneOffset()).toBe(offset);
  });

  it('el riesgo existe en esta zona o no (control): new Date("2026-01-01") puede cambiar de día', () => {
    const day = new Date('2026-01-01').getDate();
    // Hacia el oeste de UTC (offset > 0) el día local es el 31 de diciembre.
    expect(day).toBe(offset > 0 ? 31 : 1);
  });

  it.each([
    ['2026-01-01', '01/01/2026'],
    ['2026-12-31', '31/12/2026'],
    ['2026-02-28', '28/02/2026'],
    ['2028-02-29', '29/02/2028'],
  ])('formatDate(%s) = %s', (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it.each(['2026-01-01', '2026-12-31', '2028-02-29'])('isValidIsoDate(%s) es verdadero', (iso) => {
    expect(isValidIsoDate(iso)).toBe(true);
  });

  it('la tabla muestra 01/01/2026 y 31/12/2026 y el orden por fecha no cambia', async () => {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList([
            makeApplication({ id: 1, company: 'Fin de año', applied_on: '2026-12-31' }),
            makeApplication({ id: 2, company: 'Año nuevo', applied_on: '2026-01-01' }),
          ]),
        ),
    });
    renderWithProviders('/');
    await findTable();
    const dates = bodyRows().map((row) => row.querySelectorAll('td')[3].textContent);
    expect(dates).toEqual(['31/12/2026', '01/01/2026']);
  });

  it('?applied_from=2026-01-01&applied_to=2026-12-31 llega a la API y a los campos tal cual', async () => {
    const { listRequests } = stubApi();
    renderWithProviders('/?applied_from=2026-01-01&applied_to=2026-12-31');
    await findTable();
    expect(listRequests()[0]).toMatchObject({
      applied_from: '2026-01-01',
      applied_to: '2026-12-31',
    });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-12-31');
  });

  it('elegir las fechas en los campos escribe exactamente esas fechas en la URL', async () => {
    const { listRequests } = stubApi();
    const { router } = renderWithProviders('/');
    await findTable();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-12-31' } });
    expect(router.state.location.search).toBe('?applied_from=2026-01-01&applied_to=2026-12-31');
    await screen.findByRole('table');
    expect(listRequests().at(-1)).toMatchObject({
      applied_from: '2026-01-01',
      applied_to: '2026-12-31',
    });
  });

  it('desde = hasta = 2026-01-01 es un solo día válido (no se descarta por desfase)', async () => {
    const { listRequests } = stubApi();
    renderWithProviders('/?applied_from=2026-01-01&applied_to=2026-01-01');
    await findTable();
    expect(listRequests()[0]).toMatchObject({
      applied_from: '2026-01-01',
      applied_to: '2026-01-01',
    });
  });
});
