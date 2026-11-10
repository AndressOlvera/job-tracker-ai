/**
 * Aceptación de la issue #14 con ADR-009: "hoy" del formulario (valor por defecto, `max` del campo
 * y validación de "no futura") es la fecha LOCAL del navegador, en cualquier zona horaria del
 * proceso. El riesgo es `toISOString()`, que da la fecha en UTC: a las 23:30 en México (UTC-6) ya
 * sería "mañana" y a las 00:10 en Kiritimati (UTC+14) todavía sería "ayer".
 * Cada zona se prueba cambiando `process.env.TZ` en caliente (igual que la prueba de la lista).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubFormApi } from '../../test/formApi';
import { fields } from '../../test/formUtils';
import { renderWithProviders } from '../../test/renderWithProviders';
import { getToday } from './today';

const ZONES = [
  { tz: 'America/Mexico_City', offset: 360 },
  { tz: 'Pacific/Kiritimati', offset: -840 },
  { tz: 'UTC', offset: 0 },
  { tz: 'Pacific/Pago_Pago', offset: 660 },
] as const;

const originalTz = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

/** Fecha de calendario de un instante en una zona, calculada con Intl (otro camino que `today.ts`). */
function calendarDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function setLocal(y: number, m: number, d: number, hour: number, minute: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, hour, minute));
}

describe.each(ZONES)('zona horaria $tz', ({ tz, offset }) => {
  beforeEach(() => {
    process.env.TZ = tz;
    // Si Node no aplicó la zona, las pruebas pasarían sin probar nada.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(offset);
  });

  it.each([
    ['23:30 del 3 de octubre', [2026, 10, 3, 23, 30], '2026-10-03'],
    ['00:10 del 4 de octubre', [2026, 10, 4, 0, 10], '2026-10-04'],
    ['29 de febrero a las 23:30', [2028, 2, 29, 23, 30], '2028-02-29'],
    ['29 de febrero a las 00:10', [2028, 2, 29, 0, 10], '2028-02-29'],
    ['1 de marzo a las 00:10 (después del bisiesto)', [2028, 3, 1, 0, 10], '2028-03-01'],
    ['31 de diciembre a las 23:30', [2026, 12, 31, 23, 30], '2026-12-31'],
    ['1 de enero a las 00:10 (cambio de año)', [2027, 1, 1, 0, 10], '2027-01-01'],
    ['1 de enero a las 23:30', [2027, 1, 1, 23, 30], '2027-01-01'],
  ] as const)('%s: el valor por defecto y el max de la fecha son la fecha local', (_n, at, day) => {
    stubFormApi();
    setLocal(at[0], at[1], at[2], at[3], at[4]);
    renderWithProviders('/applications/new');

    expect(fields.appliedOn()).toHaveValue(day);
    expect(fields.appliedOn()).toHaveAttribute('max', day);
  });

  it('con un instante fijo, "hoy" es el día de calendario de esta zona (no el de UTC)', () => {
    stubFormApi();
    // Cada instante cae en días distintos según la zona; el oráculo es Intl.
    for (const instant of [
      new Date('2026-10-04T05:30:00Z'),
      new Date('2026-10-04T09:50:00Z'),
      new Date('2026-12-31T23:59:00Z'),
      new Date('2028-02-29T08:00:00Z'),
    ]) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(instant);
      expect(getToday()).toBe(calendarDay(instant, tz));
    }
  });

  it('el instante en que UTC ya es mañana: el formulario sigue en el día local', () => {
    stubFormApi();
    const instant = new Date('2026-10-04T05:30:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
    renderWithProviders('/applications/new');

    expect(fields.appliedOn()).toHaveValue(calendarDay(instant, tz));
    expect(fields.appliedOn()).toHaveAttribute('max', calendarDay(instant, tz));
  });

  it('acepta la fecha de hoy y rechaza la de mañana, a las 23:30 local', async () => {
    const api = stubFormApi();
    setLocal(2026, 12, 31, 23, 30);
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Becario');

    fireEvent.change(fields.appliedOn(), { target: { value: '2027-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Guardar postulación' }));
    expect(await screen.findByText('La fecha no puede ser futura.')).toBeInTheDocument();
    expect(api.callsTo('POST')).toHaveLength(0);

    fireEvent.change(fields.appliedOn(), { target: { value: '2026-12-31' } });
    await user.click(screen.getByRole('button', { name: 'Guardar postulación' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ applied_on: '2026-12-31' });
  });

  it('si el formulario sigue abierto pasada la medianoche, el día nuevo ya es válido', async () => {
    const api = stubFormApi();
    setLocal(2026, 12, 31, 23, 59);
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Becario');

    // Pasa la medianoche con la pantalla abierta: la validación usa el calendario de ese momento.
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
    fireEvent.change(fields.appliedOn(), { target: { value: '2027-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Guardar postulación' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ applied_on: '2027-01-01' });
  });
});
