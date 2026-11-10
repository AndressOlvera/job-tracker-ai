/**
 * Aceptación de la issue #14: accesibilidad del formulario (nombres accesibles, `aria-invalid` y
 * `aria-describedby`, orden de Tab, Enter y Escape, contador de notas que solo habla al 90 % y
 * al pasarse). Complementa a `ApplicationFormPage.test.tsx`.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFormApi } from '../../test/formApi';
import { describedText, fields } from '../../test/formUtils';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
});

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

/** Nombre de lo que tiene el foco: etiqueta del control, o el texto del enlace o botón. */
function focusedName(): string {
  const element = document.activeElement;
  if (!element || element === document.body) return '(body)';
  const labels = (element as HTMLInputElement).labels;
  return (labels?.[0]?.textContent ?? element.textContent ?? '').trim();
}

const liveRegion = () => document.querySelector('p[aria-live="polite"].visually-hidden');

describe('nombres accesibles', () => {
  it('cada control del formulario tiene una etiqueta propia y un nombre accesible no vacío', () => {
    stubFormApi();
    renderWithProviders('/applications/new');
    const form = screen.getByRole('form', { name: 'Nueva postulación' });

    const controls = form.querySelectorAll<HTMLElement>('input, select, textarea');
    expect(controls).toHaveLength(7);
    for (const control of controls) {
      const labels = (control as HTMLInputElement).labels;
      expect(labels, control.id).toHaveLength(1);
      expect(control).toHaveAccessibleName(/\S/);
      expect(control.id).toMatch(/^application-/);
    }
    // Los ids son únicos.
    const ids = [...controls].map((control) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los nombres son exactamente los del spec y el asterisco no entra en el nombre', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(fields.company()).toHaveAccessibleName('Empresa');
    expect(fields.position()).toHaveAccessibleName('Puesto');
    expect(fields.status()).toHaveAccessibleName('Estado');
    expect(fields.appliedOn()).toHaveAccessibleName('Fecha de postulación');
    expect(fields.jobUrl()).toHaveAccessibleName('Enlace de la vacante');
    expect(fields.source()).toHaveAccessibleName('Fuente');
    expect(fields.notes()).toHaveAccessibleName('Notas');
    // Los obligatorios se anuncian por el atributo, no por el asterisco.
    expect(fields.company()).toBeRequired();
    expect(fields.position()).toBeRequired();
    expect(fields.appliedOn()).toBeRequired();
    expect(fields.source()).not.toBeRequired();
  });

  it('hay un solo h1, el formulario se nombra con él y los botones tienen nombre', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('form')).toHaveAccessibleName('Nueva postulación');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(submitButton()).toHaveAccessibleName('Guardar postulación');
  });

  it('en edición el formulario se llama "Editar postulación" y el botón "Guardar cambios"', async () => {
    stubFormApi();
    renderWithProviders('/applications/42/edit');

    expect(await screen.findByRole('form', { name: 'Editar postulación' })).toBeInTheDocument();
    expect(submitButton()).toHaveAccessibleName('Guardar cambios');
  });
});

describe('aria-invalid y aria-describedby', () => {
  it('sin errores: no hay aria-invalid; solo la ayuda y el contador describen a Fuente y Notas', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    for (const control of [
      fields.company(),
      fields.position(),
      fields.status(),
      fields.appliedOn(),
      fields.jobUrl(),
    ]) {
      expect(control).not.toHaveAttribute('aria-invalid');
      expect(control).not.toHaveAttribute('aria-describedby');
    }
    expect(fields.source()).toHaveAccessibleDescription('Dónde encontraste la vacante.');
    expect(fields.notes()).toHaveAttribute('aria-describedby', 'application-notes-count');
    expect(fields.notes()).toHaveAccessibleDescription('0 de 5000 caracteres');
  });

  it('con error: describedby = ayuda + contador + error, en ese orden, y todos los ids existen', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');
    fireEvent.change(fields.source(), { target: { value: 'a'.repeat(61) } });
    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(5001) } });

    await user.click(submitButton());

    expect(fields.source()).toHaveAttribute(
      'aria-describedby',
      'application-source-hint application-source-error',
    );
    expect(fields.notes()).toHaveAttribute(
      'aria-describedby',
      'application-notes-count application-notes-error',
    );
    for (const control of [fields.source(), fields.notes()]) {
      for (const id of control.getAttribute('aria-describedby')!.split(' ')) {
        expect(document.getElementById(id), id).not.toBeNull();
      }
    }
    expect(fields.source()).toHaveAccessibleDescription(
      'Dónde encontraste la vacante. Máximo 60 caracteres.',
    );
  });

  it('el icono ⚠ es decorativo: no lo lee el lector de pantalla', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.click(submitButton());

    expect(fields.company()).toHaveAccessibleDescription('Este campo es obligatorio.');
  });

  it('aria-invalid aparece al enviar y se quita solo del campo que se corrige', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.click(submitButton());
    expect(fields.company()).toHaveAttribute('aria-invalid', 'true');
    expect(fields.position()).toHaveAttribute('aria-invalid', 'true');

    await user.type(fields.company(), 'Oracle');

    expect(fields.company()).not.toHaveAttribute('aria-invalid');
    expect(fields.company()).not.toHaveAttribute('aria-describedby');
    expect(fields.position()).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(fields.position())).toContain('Este campo es obligatorio.');
  });

  it('el error no se queda en el DOM huérfano: tras corregir no hay textos de error', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.click(submitButton());
    await user.type(fields.company(), 'a');
    await user.type(fields.position(), 'b');

    expect(screen.queryByText('Este campo es obligatorio.')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[id$="-error"]')).toHaveLength(0);
  });

  it('un nuevo envío con errores borra los errores anteriores que ya no aplican', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.click(submitButton());
    await user.type(fields.company(), 'Oracle');
    await user.click(submitButton());

    expect(fields.company()).not.toHaveAttribute('aria-invalid');
    expect(fields.position()).toHaveAttribute('aria-invalid', 'true');
    expect(fields.position()).toHaveFocus();
  });
});

describe('teclado', () => {
  it('el orden de Tab es el visual: volver, siete campos, Cancelar y Guardar', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    const order: string[] = [];

    // Se salta la barra superior (enlace de salto, marca y dos enlaces) y se sigue desde ahí.
    for (let i = 0; i < 4; i += 1) await user.tab();
    for (let i = 0; i < 11; i += 1) {
      await user.tab();
      order.push(focusedName());
    }

    expect(order).toEqual([
      '← Volver a postulaciones',
      'Empresa *',
      'Puesto *',
      'Estado',
      'Fecha de postulación *',
      'Enlace de la vacante',
      'Fuente',
      'Notas',
      'Cancelar',
      'Guardar postulación',
      '(body)',
    ]);
  });

  it('shift+Tab desde Guardar vuelve a Cancelar y a Notas', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    submitButton().focus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(fields.notes()).toHaveFocus();
  });

  it('Enter en un campo de una línea envía el formulario', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev{Enter}');

    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
  });

  it.each(['company', 'position', 'jobUrl', 'source'] as const)(
    'Enter en %s envía el formulario',
    async (name) => {
      const api = stubFormApi();
      const { user } = renderWithProviders('/applications/new');
      await user.type(fields.company(), 'Oracle');
      await user.type(fields.position(), 'Dev');

      await user.type(fields[name](), '{Enter}');

      await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    },
  );

  it('Enter en las notas pone un salto de línea y NO envía', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');

    await user.type(fields.notes(), 'Línea 1{Enter}Línea 2{Enter}');

    expect(fields.notes()).toHaveValue('Línea 1\nLínea 2\n');
    expect(api.callsTo('POST')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/applications/new');
  });

  it('Enter en las notas de un formulario vacío tampoco muestra errores', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');

    await user.type(fields.notes(), '{Enter}');

    expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0);
  });

  it('Enter en "Cancelar" cancela y no envía', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');
    screen.getByRole('button', { name: 'Cancelar' }).focus();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(0);
  });

  it('la barra espaciadora en "Guardar" envía una vez', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');
    submitButton().focus();

    await user.keyboard(' ');

    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
  });

  it('Escape en cualquier campo no borra lo escrito ni sale de la pantalla', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');
    await user.type(fields.jobUrl(), 'https://example.com');
    await user.type(fields.source(), 'OCC');
    await user.type(fields.notes(), 'Mis notas');

    for (const field of [
      fields.company,
      fields.position,
      fields.status,
      fields.appliedOn,
      fields.jobUrl,
      fields.source,
      fields.notes,
    ]) {
      field().focus();
      await user.keyboard('{Escape}');
    }

    expect(fields.company()).toHaveValue('Oracle');
    expect(fields.position()).toHaveValue('Dev');
    expect(fields.jobUrl()).toHaveValue('https://example.com');
    expect(fields.source()).toHaveValue('OCC');
    expect(fields.notes()).toHaveValue('Mis notas');
    expect(router.state.location.pathname).toBe('/applications/new');
  });

  it('Escape con el aviso de error enfocado no lo cierra ni pierde datos', async () => {
    stubFormApi({ post: () => Promise.reject(new TypeError('Failed to fetch')) });
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');

    await user.keyboard('{Escape}');

    expect(alert).toBeInTheDocument();
    expect(fields.company()).toHaveValue('Oracle');
  });
});

describe('avisos que se anuncian', () => {
  it('el aviso general es un role="alert" enfocable y recibe el foco', async () => {
    stubFormApi({ post: () => Promise.reject(new TypeError('Failed to fetch')) });
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Oracle');
    await user.type(fields.position(), 'Dev');

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('tabindex', '-1');
    expect(alert).toHaveFocus();
  });

  it('"No hay cambios que guardar." sale en una región de estado que ya existía vacía', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });
    const form = screen.getByRole('form');
    const region = within(form).getByRole('status');
    expect(region).toBeEmptyDOMElement();

    await user.click(submitButton());

    expect(region).toHaveTextContent('No hay cambios que guardar.');
  });
});

describe('contador de notas: solo habla al 90 % y al pasarse', () => {
  it('el mensaje cambia solo en 4500 y en 5001; entre medias el texto es el mismo', () => {
    stubFormApi();
    renderWithProviders('/applications/new');
    const seen: string[] = [];
    const record = (count: number) => {
      fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(count) } });
      seen.push(liveRegion()!.textContent ?? '');
    };

    record(0);
    record(1);
    record(4499);
    const before = seen.slice();
    record(4500);
    record(4501);
    record(4999);
    record(5000);
    record(5001);
    record(6000);

    expect(before).toEqual(['', '', '']);
    expect(seen.slice(3)).toEqual([
      'Te acercas al límite de 5000 caracteres.',
      'Te acercas al límite de 5000 caracteres.',
      'Te acercas al límite de 5000 caracteres.',
      'Te acercas al límite de 5000 caracteres.',
      'Superaste el límite de 5000 caracteres.',
      'Superaste el límite de 5000 caracteres.',
    ]);
  });

  it('el contador visible no es una región en vivo (no anuncia cada tecla)', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.notes(), 'hola');

    const counter = screen.getByText('4 de 5000 caracteres');
    expect(counter).not.toHaveAttribute('aria-live');
    expect(counter.closest('[aria-live]')).toBeNull();
    expect(liveRegion()).toHaveTextContent('');
  });

  it('los emoji cuentan por carácter en el contador (100 emoji = 100)', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    fireEvent.change(fields.notes(), { target: { value: '😀'.repeat(100) } });

    expect(screen.getByText('100 de 5000 caracteres')).toBeInTheDocument();
  });

  it('al volver a bajar del 90 % el mensaje se vacía', () => {
    stubFormApi();
    renderWithProviders('/applications/new');
    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(4600) } });
    expect(liveRegion()).not.toHaveTextContent('');

    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(100) } });

    expect(liveRegion()).toHaveTextContent('');
  });
});
