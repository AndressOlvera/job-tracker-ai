/**
 * Aceptación de la issue #14, HU-04 (editar): cada campo por separado, vaciar cada opcional,
 * PATCH solo con lo que cambió, "cambiar y volver al original" y que el cuerpo nunca lleve campos
 * del servidor. Complementa a `ApplicationFormPage.edit.test.tsx`.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { fields, setLocalNow } from '../../test/formUtils';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
});

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

async function openEdit(application = makeApplication(), route = '/applications/42/edit') {
  const api = stubFormApi({ get: () => jsonResponse(application) });
  const rendered = renderWithProviders(route);
  await screen.findByRole('form', { name: 'Editar postulación' });
  return { api, ...rendered };
}

describe('HU-04: cambiar un solo campo manda solo ese campo', () => {
  it.each([
    ['company', async (u: User) => replace(u, fields.company(), 'Intel'), { company: 'Intel' }],
    ['position', async (u: User) => replace(u, fields.position(), 'Dev'), { position: 'Dev' }],
    [
      'status',
      async (u: User) => u.selectOptions(fields.status(), 'rejected'),
      { status: 'rejected' },
    ],
    [
      'applied_on',
      async () => fireEvent.change(fields.appliedOn(), { target: { value: '2026-09-01' } }),
      { applied_on: '2026-09-01' },
    ],
    [
      'job_url',
      async (u: User) => replace(u, fields.jobUrl(), 'https://nueva.example.com/x'),
      { job_url: 'https://nueva.example.com/x' },
    ],
    ['source', async (u: User) => replace(u, fields.source(), 'LinkedIn'), { source: 'LinkedIn' }],
    ['notes', async (u: User) => replace(u, fields.notes(), 'Otra nota'), { notes: 'Otra nota' }],
  ] as const)('%s', async (_field, change, expected) => {
    setLocalNow(2026, 10, 3);
    const { api, user, router } = await openEdit();

    await change(user);
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')).toHaveLength(1);
    expect(api.callsTo('PATCH')[0].body).toEqual(expected);
  });
});

type User = ReturnType<typeof renderWithProviders>['user'];

async function replace(user: User, element: HTMLElement, text: string) {
  await user.clear(element);
  await user.type(element, text);
}

describe('HU-04: vaciar cada campo opcional manda null', () => {
  it.each(['jobUrl', 'source', 'notes'] as const)('%s', async (name) => {
    const key = { jobUrl: 'job_url', source: 'source', notes: 'notes' }[name];
    const { api, user, router } = await openEdit();

    await user.clear(fields[name]());
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ [key]: null });
  });

  it('vaciar los tres a la vez los manda todos como null y nada más', async () => {
    const { api, user, router } = await openEdit();

    await user.clear(fields.jobUrl());
    await user.clear(fields.source());
    await user.clear(fields.notes());
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ job_url: null, source: null, notes: null });
  });

  it('vaciar los obligatorios no se puede: muestra "obligatorio" y no hay petición', async () => {
    const { api, user } = await openEdit();

    await user.clear(fields.company());
    await user.clear(fields.position());
    await user.click(submitButton());

    expect(screen.getAllByText('Este campo es obligatorio.')).toHaveLength(2);
    expect(api.callsTo('PATCH')).toHaveLength(0);
    expect(fields.company()).toHaveFocus();
  });

  it('borrar la fecha tampoco se puede', async () => {
    const { api, user } = await openEdit();

    fireEvent.change(fields.appliedOn(), { target: { value: '' } });
    await user.click(submitButton());

    expect(screen.getByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(fields.appliedOn()).toHaveFocus();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });
});

describe('HU-04: lo que no cambió no se manda', () => {
  it('cambiar dos campos manda esos dos y no los otros cinco', async () => {
    const { api, user, router } = await openEdit();

    await user.selectOptions(fields.status(), 'offer');
    await replace(user, fields.notes(), 'Me dieron la oferta');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(Object.keys(api.callsTo('PATCH')[0].body as object).sort()).toEqual(['notes', 'status']);
  });

  it.each(['id', 'created_at', 'updated_at'])('el cuerpo nunca incluye %s', async (name) => {
    const { api, user, router } = await openEdit();

    // Se cambian los siete campos para que el cuerpo sea lo más grande posible.
    await replace(user, fields.company(), 'A');
    await replace(user, fields.position(), 'B');
    await user.selectOptions(fields.status(), 'applied');
    fireEvent.change(fields.appliedOn(), { target: { value: '2026-01-02' } });
    await replace(user, fields.jobUrl(), 'https://c.example.com');
    await replace(user, fields.source(), 'D');
    await replace(user, fields.notes(), 'E');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const body = api.callsTo('PATCH')[0].body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['applied_on', 'company', 'job_url', 'notes', 'position', 'source', 'status'].sort(),
    );
    expect(body).not.toHaveProperty(name);
  });

  it('el PATCH va a la URL del id de la ruta, sin id en el cuerpo', async () => {
    const { api, user, router } = await openEdit(
      makeApplication({ id: 7 }),
      '/applications/7/edit',
    );

    await replace(user, fields.company(), 'Intel');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0]).toMatchObject({ path: '/api/v1/applications/7' });
  });

  it('cambiar un texto y volver al original es "sin cambios": no hay petición', async () => {
    const { api, user, router } = await openEdit();

    await user.type(fields.company(), 'X');
    await user.type(fields.company(), '{Backspace}');
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/applications/42/edit');
  });

  it('cambiar el estado y volver al original es "sin cambios"', async () => {
    const { api, user } = await openEdit();

    await user.selectOptions(fields.status(), 'offer');
    await user.selectOptions(fields.status(), 'interview');
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('cambiar la fecha y volver a la original es "sin cambios"', async () => {
    const { api, user } = await openEdit();

    fireEvent.change(fields.appliedOn(), { target: { value: '2026-01-01' } });
    fireEvent.change(fields.appliedOn(), { target: { value: '2026-09-28' } });
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('vaciar un opcional y volver a escribir lo mismo es "sin cambios"', async () => {
    const { api, user } = await openEdit();

    await user.clear(fields.source());
    await user.type(fields.source(), 'OCC');
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it.each([
    ['company', '  Oracle  '],
    ['company', '\tOracle\n'],
    ['source', ' OCC '],
    ['jobUrl', '  https://www.occ.com.mx/empleo/oferta/12345  '],
    ['notes', '\n\nEntrevista técnica el viernes\n\n'],
  ] as const)(
    'espacios al inicio o al final de %s (%j) no cuentan como cambio',
    async (name, text) => {
      const { api, user } = await openEdit();

      await replace(user, fields[name](), text);
      await user.click(submitButton());

      expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
      expect(api.callsTo('PATCH')).toHaveLength(0);
    },
  );

  it('un opcional que era null y sigue con solo espacios no cuenta como cambio', async () => {
    const { api, user } = await openEdit(
      makeApplication({ job_url: null, source: null, notes: null }),
    );

    await user.type(fields.jobUrl(), '   ');
    await user.type(fields.source(), '\t');
    await user.type(fields.notes(), '  {Enter}  ');
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('llenar un opcional que era null manda el texto recortado', async () => {
    const { api, user, router } = await openEdit(
      makeApplication({ job_url: null, source: null, notes: null }),
    );

    await user.type(fields.source(), '  Referido  ');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ source: 'Referido' });
  });

  it('una mayúscula distinta SÍ es un cambio', async () => {
    const { api, user, router } = await openEdit();

    await replace(user, fields.company(), 'oracle');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ company: 'oracle' });
  });
});

describe('HU-04: mismas reglas que al registrar', () => {
  it('un campo cambiado se valida como al crear (120 sí, 121 no; URL; notas)', async () => {
    const { api, user } = await openEdit();

    await replace(user, fields.company(), 'a'.repeat(121));
    await replace(user, fields.jobUrl(), 'ftp://x.com');
    fireEvent.change(fields.notes(), { target: { value: 'n'.repeat(5001) } });
    await user.click(submitButton());

    expect(screen.getByText('Máximo 120 caracteres.')).toBeInTheDocument();
    expect(screen.getByText(/Escribe una URL válida/)).toBeInTheDocument();
    expect(screen.getByText('Máximo 5000 caracteres.')).toBeInTheDocument();
    expect(fields.company()).toHaveFocus();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('el 422 de un PATCH se puede corregir y reenviar con el mismo cuerpo de cambios', async () => {
    let attempt = 0;
    const api = stubFormApi({
      patch: (id, body) => {
        attempt += 1;
        return attempt === 1
          ? errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
              source: ['Ya existe esa fuente.'],
            })
          : jsonResponse(makeApplication({ ...(body as object), id }));
      },
    });
    const { user, router } = renderWithProviders('/applications/42/edit');
    await screen.findByRole('form', { name: 'Editar postulación' });

    await replace(user, fields.source(), 'Indeed');
    await user.click(submitButton());
    expect(await screen.findByText('Ya existe esa fuente.')).toBeInTheDocument();
    expect(fields.source()).toHaveFocus();

    await replace(user, fields.source(), 'Indeed 2');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH').map((c) => c.body)).toEqual([
      { source: 'Indeed' },
      { source: 'Indeed 2' },
    ]);
  });
});
