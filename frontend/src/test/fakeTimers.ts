import { vi } from 'vitest';

/**
 * Activa los temporizadores falsos de Vitest de forma que Testing Library y user-event no se
 * cuelguen. Testing Library solo avanza los temporizadores falsos si detecta Jest; el `jest`
 * falso que se declara aquí le dice que avance con el reloj de Vitest. Se deshace solo al
 * terminar la prueba (`unstubGlobals`) o con `vi.useRealTimers()`.
 *
 * Úsalo con `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.
 */
export function useFakeTimers() {
  vi.useFakeTimers();
  vi.stubGlobal('jest', { advanceTimersByTime: vi.advanceTimersByTime });
}
