import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationKeys } from '../../api/queries';
import { errorResponse, jsonResponse, makeApplication } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { describedText, fields, setLocalNow } from '../../test/formUtils';
import { deferred } from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
});

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

async function findForm() {
  return screen.findByRole('form', { name: 'Editar postulación' });
}

describe('Editar postulación: carga', () => {
  it('muestra un estado de carga accesible y luego el formulario lleno', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ get: () => reply.promise });
    renderWithProviders('/applications/42/edit');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Editar postulación' }),
    ).toBeInTheDocument();
    const loading = screen.getByText('Cargando la postulación…');
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();

    reply.resolve(jsonResponse(makeApplication()));
    await findForm();

    expect(screen.getByText('Actualiza los datos de esta postulación.')).toBeInTheDocument();
    expect(fields.company()).toHaveValue('Oracle');
    expect(fields.position()).toHaveValue('Becario de Ingeniería de Software');
    expect(fields.status()).toHaveValue('interview');
    expect(fields.appliedOn()).toHaveValue('2026-09-28');
    expect(fields.jobUrl()).toHaveValue('https://www.occ.com.mx/empleo/oferta/12345');
    expect(fields.source()).toHaveValue('OCC');
    expect(fields.notes()).toHaveValue('Entrevista técnica el viernes');
    expect(screen.getByText('29 de 5000 caracteres')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Guardar cambios');
    expect(api.detailCalls()).toEqual([
      { method: 'GET', path: '/api/v1/applications/42', body: undefined },
    ]);
  });

  it('los campos opcionales que vienen en null quedan vacíos', async () => {
    stubFormApi({
      get: () => jsonResponse(makeApplication({ job_url: null, source: null, notes: null })),
    });
    renderWithProviders('/applications/42/edit');
    await findForm();

    expect(fields.jobUrl()).toHaveValue('');
    expect(fields.source()).toHaveValue('');
    expect(fields.notes()).toHaveValue('');
    expect(screen.getByText('0 de 5000 caracteres')).toBeInTheDocument();
  });

  it.each(['abc', '0', '-1', '1.5', '1e3', '2%20', '01'])(
    'el id %j no es un entero positivo: no pide nada a la API y muestra "no encontrada"',
    (id) => {
      const api = stubFormApi();
      renderWithProviders(`/applications/${id}/edit`);

      expect(screen.getByText('No encontramos esta postulación')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ver postulaciones' })).toHaveAttribute('href', '/');
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(api.fetchMock).not.toHaveBeenCalled();
    },
  );

  it('si la API responde 404 muestra "no encontrada" con un enlace a la lista con sus filtros', async () => {
    stubFormApi({ get: () => errorResponse(404, 'not_found', 'No se encontró la postulación.') });
    renderWithProviders({
      pathname: '/applications/999/edit',
      state: { returnTo: '/?status=rejected' },
    });

    expect(await screen.findByText('No encontramos esta postulación')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver postulaciones' })).toHaveAttribute(
      'href',
      '/?status=rejected',
    );
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('un error de red al cargar muestra el mensaje con Reintentar', async () => {
    let attempts = 0;
    const api = stubFormApi({
      get: (id) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return jsonResponse(makeApplication({ id }));
      },
    });
    const { user } = renderWithProviders('/applications/42/edit');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la postulación');
    expect(alert).toHaveTextContent('No se pudo conectar con el servidor');

    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    await findForm();
    expect(fields.company()).toHaveValue('Oracle');
    expect(api.detailCalls()).toHaveLength(2);
  });

  it('al pasar de una pantalla de nueva a editar no conserva lo escrito', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.company(), 'Intel');

    await act(() => router.navigate('/applications/42/edit'));
    await findForm();

    expect(fields.company()).toHaveValue('Oracle');
  });
});

describe('Editar postulación: guardar', () => {
  it('manda solo lo que cambió, usa null para vaciar y vuelve a la lista con aviso', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/42/edit',
      state: { returnTo: '/?status=interview&page=3' },
    });
    await findForm();

    await user.selectOptions(fields.status(), 'offer');
    await user.clear(fields.jobUrl());
    await user.clear(fields.notes());
    await user.type(fields.source(), '   ');
    await user.clear(fields.source());
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?status=interview&page=3');
    expect(api.callsTo('PATCH')).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/applications/42',
        body: { status: 'offer', job_url: null, source: null, notes: null },
      },
    ]);
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('un campo opcional con solo espacios también se manda como null', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.clear(fields.notes());
    await user.type(fields.notes(), '    ');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ notes: null });
  });

  it('recorta el texto cambiado', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.clear(fields.company());
    await user.type(fields.company(), '  Intel  ');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ company: 'Intel' });
  });

  it('sin cambios no hace petición: avisa "No hay cambios que guardar."', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/applications/42/edit');
    expect(submitButton()).toBeEnabled();

    // El aviso se quita al volver a tocar el formulario.
    await user.type(fields.source(), 'x');
    expect(screen.queryByText('No hay cambios que guardar.')).not.toBeInTheDocument();
  });

  it('escribir lo mismo que ya había (con espacios) tampoco cuenta como cambio', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.type(fields.company(), '  ');
    await user.click(submitButton());

    expect(screen.getByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('vaciar un campo obligatorio muestra el error y no hace petición', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.clear(fields.company());
    await user.click(submitButton());

    expect(describedText(fields.company())).toContain('Este campo es obligatorio.');
    expect(fields.company()).toHaveFocus();
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('solo valida lo que cambió: una fecha guardada que hoy parece futura no bloquea otros cambios', async () => {
    setLocalNow(2026, 10, 3);
    const api = stubFormApi({
      get: () => jsonResponse(makeApplication({ applied_on: '2026-10-04' })),
    });
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();

    await user.selectOptions(fields.status(), 'rejected');
    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')[0].body).toEqual({ status: 'rejected' });
  });

  it('cambiar la fecha a una futura sí se rechaza', async () => {
    setLocalNow(2026, 10, 3);
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/42/edit');
    await findForm();

    const date = fields.appliedOn();
    await user.clear(date);
    await user.type(date, '2026-10-05');
    await user.click(submitButton());

    expect(describedText(date)).toContain('La fecha no puede ser futura.');
    expect(api.callsTo('PATCH')).toHaveLength(0);
  });

  it('el doble clic en Guardar cambios hace una sola petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ patch: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.selectOptions(fields.status(), 'offer');

    await user.dblClick(submitButton());

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(api.callsTo('PATCH')).toHaveLength(1);
    reply.resolve(jsonResponse(makeApplication({ status: 'offer' })));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('PATCH')).toHaveLength(1);
  });

  it('muestra los 422 de la API junto a su campo y los de body en el aviso general', async () => {
    stubFormApi({
      patch: () =>
        errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
          job_url: ['La URL debe empezar con http:// o https://.'],
          body: ['Envía al menos un campo.'],
        }),
    });
    const { user } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.selectOptions(fields.status(), 'offer');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Envía al menos un campo.');
    expect(describedText(fields.jobUrl())).toContain('La URL debe empezar con http:// o https://.');
    expect(fields.jobUrl()).toHaveFocus();
    expect(fields.status()).toHaveValue('offer');
  });

  it('si la postulación se eliminó mientras se editaba (404) conserva lo escrito y avisa', async () => {
    stubFormApi({ patch: () => errorResponse(404, 'not_found', 'No se encontró la postulación.') });
    const { user, router } = renderWithProviders('/applications/42/edit');
    await findForm();
    await user.clear(fields.notes());
    await user.type(fields.notes(), 'Nueva nota');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la postulación.');
    expect(fields.notes()).toHaveValue('Nueva nota');
    expect(router.state.location.pathname).toBe('/applications/42/edit');
  });

  it('un refresco en segundo plano no pisa lo que el usuario está escribiendo', async () => {
    let version = 0;
    const api = stubFormApi({
      get: (id) => {
        version += 1;
        return jsonResponse(
          makeApplication({
            id,
            company: `Oracle v${version}`,
            ...(version > 1 && { notes: 'otra' }),
          }),
        );
      },
    });
    const { user, queryClient } = renderWithProviders('/applications/42/edit');
    await findForm();
    expect(fields.company()).toHaveValue('Oracle v1');
    await user.clear(fields.company());
    await user.type(fields.company(), 'Mi empresa');

    await act(() => queryClient.invalidateQueries({ queryKey: applicationKeys.detail(42) }));

    await waitFor(() => expect(api.detailCalls()).toHaveLength(2));
    expect(fields.company()).toHaveValue('Mi empresa');
    expect(fields.notes()).toHaveValue('Entrevista técnica el viernes');
  });
});
