/**
 * Aceptación de la issue #14: "evita envíos dobles" y se puede reenviar tras un error.
 * Complementa a `ApplicationFormPage.test.tsx` (doble clic, Enter repetido y `requestSubmit`
 * doble en alta) con clic + Enter, el modo edición y el reenvío tras 422, 5xx y red caída.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { fields } from '../../test/formUtils';
import { deferred } from '../../test/listApi';
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

describe('envío doble en una postulación nueva', () => {
  it('clic y luego Enter en un campo mientras la primera petición está pendiente: UNA petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    await user.type(fields.source(), '{Enter}');
    await user.type(fields.company(), '{Enter}');
    await user.keyboard('{Enter}');

    expect(api.callsTo('POST')).toHaveLength(1);
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });

  it('Enter en un campo y luego clic: UNA petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.type(fields.position(), '{Enter}');
    await user.click(submitButton());
    await user.click(submitButton());

    expect(api.callsTo('POST')).toHaveLength(1);
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('muchos clics seguidos (fireEvent) mientras está pendiente: UNA petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    for (let i = 0; i < 5; i += 1) fireEvent.click(submitButton());

    // La petición sale en el siguiente microtask: se espera a que salga y se comprueba que no hay más.
    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.callsTo('POST')).toHaveLength(1);
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('un clic en Cancelar mientras se envía no sale de la pantalla ni cancela el guardado', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(router.state.location.pathname).toBe('/applications/new');
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });

  it('mientras se envía el formulario anuncia que está ocupado (aria-busy)', async () => {
    const reply = deferred<Response>();
    stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    const form = screen.getByRole('form', { name: 'Nueva postulación' });
    expect(form).toHaveAttribute('aria-busy', 'false');

    await user.click(submitButton());
    expect(form).toHaveAttribute('aria-busy', 'true');

    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('con errores de validación del navegador, un segundo envío no deja la guardia puesta', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');

    await user.click(submitButton());
    await user.click(submitButton());
    expect(api.callsTo('POST')).toHaveLength(0);
    expect(submitButton()).toBeEnabled();

    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });
});

describe('envío doble en la edición', () => {
  it('clic + Enter + requestSubmit mientras está pendiente: UNA petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ patch: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });
    await user.type(fields.source(), 'x');

    await user.click(submitButton());
    await user.type(fields.company(), '{Enter}');
    (screen.getByRole('form') as HTMLFormElement).requestSubmit();

    expect(api.callsTo('PATCH')).toHaveLength(1);
    expect(submitButton()).toHaveTextContent('Guardando…');
    reply.resolve(jsonResponse(makeApplication({ source: 'OCCx' })));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')).toHaveLength(1);
  });

  it('sin cambios, mil clics son cero peticiones y el botón sigue disponible', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });

    for (let i = 0; i < 3; i += 1) await user.click(submitButton());

    expect(api.callsTo('PATCH')).toHaveLength(0);
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Guardar cambios');
  });
});

describe('reenviar después de un error', () => {
  it('tras un 422 el botón vuelve a estar activo y el reenvío corregido sale una sola vez', async () => {
    let attempt = 0;
    const api = stubFormApi({
      post: (body) => {
        attempt += 1;
        return attempt === 1
          ? errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
              company: ['Esa empresa ya existe.'],
            })
          : jsonResponse(makeApplication({ ...(body as object), id: 8 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    expect(await screen.findByText('Esa empresa ya existe.')).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Guardar postulación');

    await user.type(fields.company(), ' 2');
    await user.dblClick(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST').map((c) => (c.body as { company: string }).company)).toEqual([
      'Oracle',
      'Oracle 2',
    ]);
  });

  it('tras un 422 se puede reenviar lo mismo sin tocar nada (el servidor puede haber cambiado)', async () => {
    let attempt = 0;
    const api = stubFormApi({
      post: (body) => {
        attempt += 1;
        return attempt === 1
          ? errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
              body: ['Intenta de nuevo.'],
            })
          : jsonResponse(makeApplication({ ...(body as object), id: 8 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    await screen.findByRole('alert');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(2);
    expect(api.callsTo('POST')[1].body).toEqual(api.callsTo('POST')[0].body);
  });

  it.each([
    [400, 'bad_request', 'El cuerpo de la petición no es JSON válido.'],
    [415, 'unsupported_media_type', 'Falta el encabezado Content-Type.'],
    [500, 'internal_error', 'Ocurrió un error inesperado.'],
    [405, 'method_not_allowed', 'Método no permitido.'],
  ])(
    'tras un %i se puede reintentar y sale una petición por intento y el formulario sigue enviable',
    async (status, code, message) => {
      let attempt = 0;
      const api = stubFormApi({
        post: (body) => {
          attempt += 1;
          return attempt <= 2
            ? errorResponse(status, code, message)
            : jsonResponse(makeApplication({ ...(body as object), id: 8 }), 201);
        },
      });
      const { user, router } = renderWithProviders('/applications/new');
      await fillRequired(user);

      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(api.callsTo('POST')).toHaveLength(1);

      await user.click(submitButton());
      await waitFor(() => expect(api.callsTo('POST')).toHaveLength(2));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
      expect(submitButton()).toBeEnabled();

      await user.click(submitButton());
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(api.callsTo('POST')).toHaveLength(3);
    },
  );

  it('tras un 503 de proxy (sin JSON) el aviso es el de servicio no disponible y se puede reintentar', async () => {
    let attempt = 0;
    const api = stubFormApi({
      post: (body) => {
        attempt += 1;
        return attempt === 1
          ? new Response('<html>Bad gateway</html>', { status: 503 })
          : jsonResponse(makeApplication({ ...(body as object), id: 8 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.type(fields.notes(), 'No perder esto');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servidor no está disponible en este momento.',
    );
    expect(fields.notes()).toHaveValue('No perder esto');
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(2);
  });

  it('con un 200 que no es JSON el aviso es "respondió de forma inesperada" y no navega', async () => {
    stubFormApi({ post: () => new Response('ok', { status: 201 }) });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servidor respondió de forma inesperada.',
    );
    expect(router.state.location.pathname).toBe('/applications/new');
    expect(submitButton()).toBeEnabled();
  });

  it('el error de red conserva los siete campos y reintenta con el mismo cuerpo', async () => {
    let attempt = 0;
    const api = stubFormApi({
      post: (body) => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return jsonResponse(makeApplication({ ...(body as object), id: 8 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.selectOptions(fields.status(), 'offer');
    fireEvent.change(fields.appliedOn(), { target: { value: '2026-01-15' } });
    await user.type(fields.jobUrl(), 'https://example.com/v');
    await user.type(fields.source(), 'LinkedIn');
    await user.type(fields.notes(), 'Línea 1\nLínea 2');

    await user.click(submitButton());
    await screen.findByRole('alert');

    expect(fields.status()).toHaveValue('offer');
    expect(fields.appliedOn()).toHaveValue('2026-01-15');
    expect(fields.jobUrl()).toHaveValue('https://example.com/v');
    expect(fields.source()).toHaveValue('LinkedIn');
    expect(fields.notes()).toHaveValue('Línea 1\nLínea 2');

    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[1].body).toEqual(api.callsTo('POST')[0].body);
  });

  it('el aviso general del intento anterior desaparece al reintentar', async () => {
    const reply = deferred<Response>();
    let attempt = 0;
    stubFormApi({
      post: () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return reply.promise;
      },
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    await screen.findByRole('alert');
    await user.click(submitButton());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Guardando…');
    reply.resolve(jsonResponse(makeApplication({ id: 8 }), 201));
  });
});
