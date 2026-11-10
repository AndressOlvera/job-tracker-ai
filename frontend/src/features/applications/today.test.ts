import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLocalDate, getToday } from './today';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatLocalDate', () => {
  it('da AAAA-MM-DD con ceros a la izquierda', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('getToday (ADR-009)', () => {
  it('usa el reloj del sistema', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 9, 0));
    expect(getToday()).toBe('2026-10-03');
  });

  it('a las 23:30 hora local sigue siendo el día local, aunque en UTC ya sea el siguiente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 23, 30));
    expect(getToday()).toBe('2026-10-03');
  });

  it('justo después de la medianoche local ya es el día siguiente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 0, 5));
    expect(getToday()).toBe('2026-10-03');
    vi.setSystemTime(new Date(2026, 9, 4, 0, 0));
    expect(getToday()).toBe('2026-10-04');
  });

  it('acepta una fecha dada, sin tocar el reloj', () => {
    expect(getToday(new Date(2024, 1, 29, 23, 59))).toBe('2024-02-29');
  });
});
