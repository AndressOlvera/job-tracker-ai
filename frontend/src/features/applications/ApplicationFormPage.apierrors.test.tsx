/**
 * Aceptación de la issue #14: "muestra los errores 422 de la API por campo" (docs/03-api.md →
 * Errores, docs/04-pantallas.md → 2). Complementa a `ApplicationFormPage.test.tsx` con cada campo
 * por separado, varios mensajes, el orden del foco, la mezcla campo + `body` y los bordes de
 * `details`.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { describedText, fields } from '../../test/formUtils';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
});

type User = ReturnType<typeof renderWithProviders>['user'];

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

async function fillRequired(user: User) {
  await user.type(fields.company(), 'Oracle');
  await user.type(fields.position(), 'Becario de Software');
}

function unprocessable(
  details?: Record<string, string[]>,
  message = 'Algunos campos no son válidos.',
) {
  return () => errorResponse(422, 'validation_error', message, details);
}

/** Cada campo de la API con el control que lo muestra. */
const CONTROLS = {
  company: () => fields.company(),
  position: () => fields.position(),
  status: () => fields.status(),
  applied_on: () => fields.appliedOn(),
  job_url: () => fields.jobUrl(),
  source: () => fields.source(),
  notes: () => fields.notes(),
} as const;

describe('422 de la API: cada campo', () => {
  it.each(Object.keys(CONTROLS) as (keyof typeof CONTROLS)[])(
    '%s: el mensaje sale tal cual junto a su campo, con foco y sin aviso general',
    async (field) => {
      stubFormApi({ post: unprocessable({ [field]: [`Mensaje del servidor para ${field}.`] }) });
      const { user } = renderWithProviders('/applications/new');
      await fillRequired(user);

      await user.click(submitButton());

      const control = CONTROLS[field]();
      await waitFor(() => expect(control).toHaveAttribute('aria-invalid', 'true'));
      expect(describedText(control)).toContain(`Mensaje del servidor para ${field}.`);
      expect(control).toHaveFocus();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // Los demás campos quedan sin marcar.
      for (const other of Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]) {
        if (other !== field) expect(CONTROLS[other]()).not.toHaveAttribute('aria-invalid');
      }
      expect(submitButton()).toBeEnabled();
    },
  );

  it('varios mensajes de un mismo campo se muestran todos, completos', async () => {
    stubFormApi({
      post: unprocessable({
        job_url: ['La URL debe empezar con http:// o https://.', 'La URL es demasiado larga.'],
      }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(fields.jobUrl()).toHaveAttribute('aria-invalid', 'true'));
    const text = describedText(fields.jobUrl());
    expect(text).toContain('La URL debe empezar con http:// o https://.');
    expect(text).toContain('La URL es demasiado larga.');
  });

  it('el orden del foco es el visual, no el de las llaves de la API (llaves al revés)', async () => {
    stubFormApi({
      post: unprocessable({
        notes: ['n'],
        source: ['s'],
        job_url: ['u'],
        applied_on: ['a'],
        status: ['e'],
        position: ['p'],
        company: ['c'],
      }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(fields.company()).toHaveFocus());
    for (const field of Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]) {
      expect(CONTROLS[field]()).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it.each([
    [['notes', 'source', 'job_url'], 'jobUrl'],
    [['notes', 'status'], 'status'],
    [['source', 'applied_on'], 'appliedOn'],
    [['notes'], 'notes'],
  ] as const)('con errores en %j el foco va a %s', async (keys, focused) => {
    stubFormApi({ post: unprocessable(Object.fromEntries(keys.map((k) => [k, ['error']]))) });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(fields[focused]()).toHaveFocus());
  });

  it('el mensaje de la API no se interpreta como HTML', async () => {
    stubFormApi({
      post: unprocessable({ company: ['<img src=x onerror="window.__pwned=1"> <b>negrita</b>'] }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('form b')).toBeNull();
  });
});

describe('422 de la API: avisos generales', () => {
  it('error de un campo y de body a la vez: ambos se ven y el foco va al campo, no al aviso', async () => {
    stubFormApi({
      post: unprocessable({ body: ['El cuerpo no es válido.'], position: ['Puesto repetido.'] }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El cuerpo no es válido.');
    expect(describedText(fields.position())).toContain('Puesto repetido.');
    expect(fields.position()).toHaveFocus();
    expect(alert).not.toHaveFocus();
  });

  it('solo una llave desconocida: aviso general con el mensaje y el foco en el aviso', async () => {
    stubFormApi({ post: unprocessable({ extra_field: ['Campo no permitido.'] }) });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Campo no permitido.');
    expect(alert).toHaveFocus();
    expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0);
  });

  it('las llaves id, created_at y updated_at (campos del servidor) van al aviso general', async () => {
    stubFormApi({
      post: unprocessable({
        id: ['Campo no permitido.'],
        created_at: ['Campo no permitido.'],
      }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getAllByText('Campo no permitido.').length).toBeGreaterThan(0);
  });

  it.each([
    ['details vacío', {}],
    ['un campo con lista vacía', { company: [] }],
  ])('422 con %s muestra el mensaje de la API como aviso general', async (_name, details) => {
    stubFormApi({ post: unprocessable(details, 'Revisa los datos.') });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos.');
    expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0);
  });

  it('422 con "details": null no rompe la pantalla', async () => {
    stubFormApi({
      post: () =>
        jsonResponse(
          { error: { code: 'validation_error', message: 'Datos inválidos.', details: null } },
          422,
        ),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.');
    expect(fields.company()).toHaveValue('Oracle');
  });

  it('dos mensajes iguales en body no rompen la lista del aviso (llaves de React)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFormApi({ post: unprocessable({ body: ['Repetido.'], extra: ['Repetido.'] }) });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await screen.findByRole('alert');
    expect(errors.mock.calls.flat().join('\n')).not.toMatch(/same key/i);
  });

  it.each([
    ['un número', 5],
    ['un objeto', { a: 1 }],
  ])(
    'un 422 con details que trae %s no deja el botón en "Guardando…" ni errores sin manejar',
    async (_name, value) => {
      const unhandled = vi.fn();
      window.addEventListener('unhandledrejection', unhandled);
      stubFormApi({
        post: () =>
          jsonResponse(
            {
              error: {
                code: 'validation_error',
                message: 'Datos inválidos.',
                details: { company: value },
              },
            },
            422,
          ),
      });
      const { user } = renderWithProviders('/applications/new');
      await fillRequired(user);

      await user.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.');
      expect(submitButton()).toHaveTextContent('Guardar postulación');
      expect(submitButton()).toBeEnabled();
      expect(fields.company()).toHaveValue('Oracle');
      window.removeEventListener('unhandledrejection', unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    },
  );

  it('un 422 con details de texto suelto lo muestra junto al campo', async () => {
    stubFormApi({
      post: () =>
        jsonResponse(
          { error: { code: 'validation_error', message: 'x', details: { company: 'Ya existe.' } } },
          422,
        ),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByText('Ya existe.')).toBeInTheDocument();
    expect(describedText(fields.company())).toContain('Ya existe.');
    expect(submitButton()).toBeEnabled();
  });

  it('el aviso general queda hasta el siguiente envío y entonces se quita', async () => {
    let attempt = 0;
    stubFormApi({
      post: (body) => {
        attempt += 1;
        return attempt === 1
          ? errorResponse(422, 'validation_error', 'x', { body: ['Cuerpo inválido.'] })
          : jsonResponse(makeApplication({ ...(body as object), id: 9 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.click(submitButton());
    await screen.findByRole('alert');

    // Escribir no lo quita (no es un error de campo)...
    await user.type(fields.source(), 'x');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // ...pero al reenviar sí.
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByText('Cuerpo inválido.')).not.toBeInTheDocument();
  });
});

describe('422 de la API: limpiar los errores al corregir', () => {
  async function renderWithThreeErrors() {
    stubFormApi({
      post: unprocessable({
        company: ['Empresa repetida.'],
        status: ['Estado no permitido.'],
        notes: ['Notas rechazadas.'],
      }),
    });
    const rendered = renderWithProviders('/applications/new');
    await fillRequired(rendered.user);
    await rendered.user.click(submitButton());
    await screen.findByText('Notas rechazadas.');
    return rendered;
  }

  it('modificar un campo quita solo su error y deja los otros', async () => {
    const { user } = await renderWithThreeErrors();

    await user.type(fields.company(), 'X');

    expect(screen.queryByText('Empresa repetida.')).not.toBeInTheDocument();
    expect(screen.getByText('Estado no permitido.')).toBeInTheDocument();
    expect(screen.getByText('Notas rechazadas.')).toBeInTheDocument();
  });

  it('aria-invalid y aria-describedby se actualizan al corregir un campo y solo en ese campo', async () => {
    const { user } = await renderWithThreeErrors();
    expect(fields.company()).toHaveAttribute('aria-invalid', 'true');
    expect(fields.company()).toHaveAttribute('aria-describedby', 'application-company-error');

    await user.type(fields.company(), 'X');

    expect(fields.company()).not.toHaveAttribute('aria-invalid');
    expect(fields.company()).not.toHaveAttribute('aria-describedby');
    expect(fields.notes()).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(fields.notes())).toContain('Notas rechazadas.');
    expect(fields.status()).toHaveAttribute('aria-invalid', 'true');
  });

  it('cambiar el estado (select) quita el error del estado', async () => {
    const { user } = await renderWithThreeErrors();

    await user.selectOptions(fields.status(), 'offer');

    expect(screen.queryByText('Estado no permitido.')).not.toBeInTheDocument();
    expect(fields.status()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Empresa repetida.')).toBeInTheDocument();
  });

  it('tocar un campo sin error (Fuente) no quita ningún error', async () => {
    const { user } = await renderWithThreeErrors();

    await user.type(fields.source(), 'LinkedIn');

    expect(screen.getByText('Empresa repetida.')).toBeInTheDocument();
    expect(screen.getByText('Estado no permitido.')).toBeInTheDocument();
    expect(screen.getByText('Notas rechazadas.')).toBeInTheDocument();
  });

  it('el error del servidor sigue ahí si solo se enfoca el campo sin escribir', async () => {
    const { user } = await renderWithThreeErrors();

    await user.click(fields.notes());
    await user.tab();

    expect(screen.getByText('Notas rechazadas.')).toBeInTheDocument();
  });
});

describe('422 de la API en la edición', () => {
  it('los errores de campos que no se tocaron también salen junto a su campo', async () => {
    stubFormApi({ patch: unprocessable({ job_url: ['La URL ya existe.'], body: ['Algo más.'] }) });
    const { user } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });
    await user.type(fields.notes(), '!');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo más.');
    expect(describedText(fields.jobUrl())).toContain('La URL ya existe.');
    expect(fields.jobUrl()).toHaveFocus();
    // Y se puede corregir: el campo conserva su valor y el botón sigue activo.
    expect(fields.notes()).toHaveValue('Entrevista técnica el viernes!');
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Guardar cambios');
  });

  it('el error del campo se limpia al modificarlo, sin tocar los otros', async () => {
    stubFormApi({
      patch: unprocessable({ source: ['Fuente no válida.'], notes: ['Nota no válida.'] }),
    });
    const { user } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });
    await user.type(fields.company(), 'X');
    await user.click(submitButton());
    await screen.findByText('Nota no válida.');

    await user.type(fields.source(), '!');

    expect(screen.queryByText('Fuente no válida.')).not.toBeInTheDocument();
    expect(screen.getByText('Nota no válida.')).toBeInTheDocument();
  });
});
