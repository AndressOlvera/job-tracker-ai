import { screen } from '@testing-library/react';
import { vi } from 'vitest';

/** Fija el día y la hora LOCALES sin tocar los temporizadores (que Testing Library necesita). */
export function setLocalNow(year: number, month: number, day: number, hour = 9, minute = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute));
}

/** Los campos del formulario por su etiqueta (sin el asterisco, que es decoración). */
export const fields = {
  company: () => screen.getByRole('textbox', { name: 'Empresa' }),
  position: () => screen.getByRole('textbox', { name: 'Puesto' }),
  status: () => screen.getByRole('combobox', { name: 'Estado' }),
  appliedOn: () => screen.getByLabelText(/^Fecha de postulación/) as HTMLInputElement,
  jobUrl: () => screen.getByRole('textbox', { name: 'Enlace de la vacante' }),
  source: () => screen.getByRole('textbox', { name: 'Fuente' }),
  notes: () => screen.getByRole('textbox', { name: 'Notas' }),
};

/** El texto de los elementos que describen a un campo (`aria-describedby`): ayuda y error. */
export function describedText(element: HTMLElement): string {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}
