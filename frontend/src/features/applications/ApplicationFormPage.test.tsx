import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '../../api/client';
import { errorResponse, jsonResponse, makeApplication } from '../../test/api';
import { deferred } from '../../test/listApi';
import { stubFormApi } from '../../test/formApi';
import { describedText, fields, setLocalNow } from '../../test/formUtils';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => {
  vi.useRealTimers();
});

function submitButton() {
  return screen.getByRole('button', { name: /^Guardar|^Guardando/ });
}

/** Llena lo mínimo para que el formulario sea válido. */
async function fillRequired(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(fields.company(), 'Oracle');
  await user.type(fields.position(), 'Becario de Software');
}

describe('Nueva postulación: pantalla', () => {
  it('muestra el encabezado, el aviso de obligatorios y los siete campos', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(screen.getByRole('link', { name: /Volver a postulaciones/ })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nueva postulación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Registra una vacante a la que aplicaste.')).toBeInTheDocument();
    expect(screen.getByText('Los campos con * son obligatorios.')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Nueva postulación' })).toBeInTheDocument();

    for (const field of Object.values(fields)) expect(field()).toBeInTheDocument();
    expect(fields.company()).toBeRequired();
    expect(fields.position()).toBeRequired();
    expect(fields.appliedOn()).toBeRequired();
    expect(fields.status()).not.toBeRequired();
    expect(describedText(fields.source())).toBe('Dónde encontraste la vacante.');
    expect(screen.getByText('0 de 5000 caracteres')).toBeInTheDocument();
    expect(submitButton()).toHaveTextContent('Guardar postulación');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('el estado empieza en Postulado y trae los cuatro estados en español', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(fields.status()).toHaveValue('applied');
    const labels = within(fields.status())
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels).toEqual(['Postulado', 'Entrevista', 'Oferta', 'Rechazado']);
  });

  it('la fecha empieza en hoy y no permite fechas futuras', () => {
    setLocalNow(2026, 10, 3, 9, 0);
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(fields.appliedOn()).toHaveValue('2026-10-03');
    expect(fields.appliedOn()).toHaveAttribute('max', '2026-10-03');
  });

  it('a las 23:30 hora local la fecha sigue siendo la de hoy (ADR-009)', () => {
    setLocalNow(2026, 10, 3, 23, 30);
    stubFormApi();
    renderWithProviders('/applications/new');

    expect(fields.appliedOn()).toHaveValue('2026-10-03');
    expect(fields.appliedOn()).toHaveAttribute('max', '2026-10-03');
  });

  it('no limita en silencio lo que se escribe: no usa maxlength', () => {
    stubFormApi();
    renderWithProviders('/applications/new');

    for (const field of [
      fields.company,
      fields.position,
      fields.jobUrl,
      fields.source,
      fields.notes,
    ]) {
      expect(field()).not.toHaveAttribute('maxlength');
    }
  });

  it('el contador de notas cuenta lo escrito y avisa al acercarse y al pasarse del límite', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    const live = () => document.querySelector('p[aria-live="polite"].visually-hidden');

    await user.type(fields.notes(), 'Hola');
    expect(screen.getByText('4 de 5000 caracteres')).toBeInTheDocument();
    expect(live()).toHaveTextContent('');

    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(4600) } });
    expect(screen.getByText('4600 de 5000 caracteres')).toBeInTheDocument();
    expect(live()).toHaveTextContent('Te acercas al límite de 5000 caracteres.');

    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(5001) } });
    expect(screen.getByText('5001 de 5000 caracteres')).toBeInTheDocument();
    expect(live()).toHaveTextContent('Superaste el límite de 5000 caracteres.');
    expect(describedText(fields.notes())).toContain('5001 de 5000 caracteres');
  });
});

describe('Nueva postulación: validación en el navegador', () => {
  it('con el formulario vacío no hace petición y marca empresa y puesto', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');

    await user.click(submitButton());

    expect(api.callsTo('POST')).toHaveLength(0);
    for (const field of [fields.company(), fields.position()]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(field)).toContain('Este campo es obligatorio.');
    }
    expect(fields.status()).not.toHaveAttribute('aria-invalid');
    expect(fields.appliedOn()).not.toHaveAttribute('aria-invalid');
  });

  it('mueve el foco al primer campo con error', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');

    await user.click(submitButton());
    expect(fields.company()).toHaveFocus();

    await user.type(fields.company(), 'Oracle');
    await user.click(submitButton());
    expect(fields.position()).toHaveFocus();
  });

  it('respeta el orden visual: con errores en enlace y notas, el foco va al enlace', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.notes(), { target: { value: 'a'.repeat(5001) } });
    await user.type(fields.jobUrl(), 'ftp://example.com');

    await user.click(submitButton());

    expect(fields.jobUrl()).toHaveFocus();
    expect(describedText(fields.notes())).toContain('Máximo 5000 caracteres.');
  });

  it.each([
    ['company', 'a'.repeat(121), 'Máximo 120 caracteres.'],
    ['position', 'a'.repeat(121), 'Máximo 120 caracteres.'],
    ['source', 'a'.repeat(61), 'Máximo 60 caracteres.'],
    ['notes', 'a'.repeat(5001), 'Máximo 5000 caracteres.'],
    ['jobUrl', `https://example.com/${'a'.repeat(500)}`, 'Máximo 500 caracteres.'],
    ['jobUrl', 'javascript:alert(1)', 'Escribe una URL válida que empiece con http:// o https://.'],
    [
      'jobUrl',
      'ftp://example.com/archivo',
      'Escribe una URL válida que empiece con http:// o https://.',
    ],
    ['jobUrl', 'example.com', 'Escribe una URL válida que empiece con http:// o https://.'],
  ] as const)('%s: %j muestra "%s" junto al campo', async (name, value, message) => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields[name](), { target: { value } });

    await user.click(submitButton());

    expect(api.callsTo('POST')).toHaveLength(0);
    expect(fields[name]()).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(fields[name]())).toContain(message);
    expect(fields[name]()).toHaveFocus();
  });

  it('la fecha es obligatoria y no puede ser futura', async () => {
    setLocalNow(2026, 10, 3);
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.appliedOn(), { target: { value: '' } });
    await user.click(submitButton());
    expect(describedText(fields.appliedOn())).toContain('Este campo es obligatorio.');
    expect(fields.appliedOn()).toHaveFocus();

    fireEvent.change(fields.appliedOn(), { target: { value: '2026-10-04' } });
    expect(fields.appliedOn()).not.toHaveAttribute('aria-invalid');
    await user.click(submitButton());
    expect(describedText(fields.appliedOn())).toContain('La fecha no puede ser futura.');
    expect(api.callsTo('POST')).toHaveLength(0);
  });

  it('empresa y puesto con solo espacios cuentan como vacíos', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.type(fields.company(), '   ');
    await user.type(fields.position(), '  ');

    await user.click(submitButton());

    expect(describedText(fields.company())).toContain('Este campo es obligatorio.');
    expect(describedText(fields.position())).toContain('Este campo es obligatorio.');
  });

  it('el error de un campo desaparece al modificarlo, y los demás se quedan', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await user.click(submitButton());

    await user.type(fields.company(), 'O');

    expect(fields.company()).not.toHaveAttribute('aria-invalid');
    expect(fields.company()).not.toHaveAttribute('aria-describedby');
    expect(fields.position()).toHaveAttribute('aria-invalid', 'true');
  });

  it('acepta una URL https y un enlace http con espacios alrededor', async () => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.type(fields.jobUrl(), ' http://localhost:5173/vacante?id=1 ');

    await user.click(submitButton());

    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    expect(api.callsTo('POST')[0].body).toMatchObject({
      job_url: 'http://localhost:5173/vacante?id=1',
    });
  });
});

describe('Nueva postulación: envío', () => {
  it('crea con el cuerpo exacto, vuelve a la lista con sus filtros y avisa', async () => {
    setLocalNow(2026, 10, 3);
    const api = stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '/?status=interview&page=2' },
    });
    await user.type(fields.company(), '  Oracle ');
    await user.type(fields.position(), 'Becario de Software');
    await user.selectOptions(fields.status(), 'interview');
    await user.type(fields.jobUrl(), 'https://www.occ.com.mx/empleo/12345');
    await user.type(fields.source(), 'OCC');
    await user.type(fields.notes(), 'Entrevista el viernes');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?status=interview&page=2');
    expect(api.callsTo('POST')).toEqual([
      {
        method: 'POST',
        path: '/api/v1/applications',
        body: {
          company: 'Oracle',
          position: 'Becario de Software',
          status: 'interview',
          applied_on: '2026-10-03',
          job_url: 'https://www.occ.com.mx/empleo/12345',
          source: 'OCC',
          notes: 'Entrevista el viernes',
        },
      },
    ]);
    // El aviso vive en una región de estado que se anuncia al aparecer.
    const toast = await screen.findByText('Postulación guardada');
    expect(toast.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('heading', { level: 1, name: 'Postulaciones' })).toBeInTheDocument();
  });

  it('omite los opcionales vacíos o con solo espacios', async () => {
    setLocalNow(2026, 10, 3);
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.type(fields.source(), '   ');
    await user.type(fields.notes(), '  ');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toEqual({
      company: 'Oracle',
      position: 'Becario de Software',
      status: 'applied',
      applied_on: '2026-10-03',
    });
  });

  it('sin estado de la lista, vuelve a / (también si returnTo no es una ruta interna)', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '//otro-sitio.com' },
    });
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
  });

  it('mientras se envía el botón dice "Guardando…", se desactiva y el doble clic hace UNA petición', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.dblClick(submitButton());

    const button = screen.getByRole('button', { name: 'Guardando…' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(api.callsTo('POST')).toHaveLength(1);

    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });

  it('Enter repetido en un campo tampoco duplica el envío', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.type(fields.source(), '{Enter}{Enter}{Enter}');

    expect(api.callsTo('POST')).toHaveLength(1);
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });

  it('dos envíos antes de que React vuelva a dibujar tampoco duplican (guardia síncrona)', async () => {
    const reply = deferred<Response>();
    const api = stubFormApi({ post: () => reply.promise });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    const form = screen.getByRole('form') as HTMLFormElement;

    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });

    await waitFor(() => expect(api.callsTo('POST')).toHaveLength(1));
    reply.resolve(jsonResponse(makeApplication({ id: 7 }), 201));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(1);
  });

  it('tras el éxito el botón sigue bloqueado mientras se navega', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    expect(api.callsTo('POST')).toHaveLength(1);
  });
});

describe('Nueva postulación: errores de la API', () => {
  it('muestra el 422 de cada campo con el mensaje de la API y enfoca el primero', async () => {
    stubFormApi({
      post: () =>
        errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
          applied_on: ['La fecha no puede ser futura.'],
          company: ['Este campo es obligatorio.'],
          job_url: ['La URL debe empezar con http:// o https://.'],
        }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByText('La fecha no puede ser futura.')).toBeInTheDocument();
    expect(describedText(fields.company())).toContain('Este campo es obligatorio.');
    expect(describedText(fields.appliedOn())).toContain('La fecha no puede ser futura.');
    expect(describedText(fields.jobUrl())).toContain('La URL debe empezar con http:// o https://.');
    expect(fields.company()).toHaveFocus();
    expect(fields.company()).toHaveAttribute('aria-invalid', 'true');
    // Los errores de campo no se repiten en el aviso general.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // El formulario se puede reintentar.
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent('Guardar postulación');
  });

  it('el error de la API de un campo se limpia al modificarlo', async () => {
    stubFormApi({
      post: () =>
        errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
          source: ['Máximo 60 caracteres.'],
          notes: ['Máximo 5000 caracteres.'],
        }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.click(submitButton());
    await screen.findByText('Máximo 60 caracteres.');

    await user.type(fields.source(), 'x');

    expect(screen.queryByText('Máximo 60 caracteres.')).not.toBeInTheDocument();
    expect(screen.getByText('Máximo 5000 caracteres.')).toBeInTheDocument();
  });

  it('los errores de body y las llaves desconocidas van a un aviso general', async () => {
    stubFormApi({
      post: () =>
        errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
          body: ['El cuerpo no es válido.'],
          extra: ['Campo no permitido.'],
        }),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El cuerpo no es válido.');
    expect(alert).toHaveTextContent('Campo no permitido.');
    expect(alert).toHaveFocus();
    expect(fields.company()).not.toHaveAttribute('aria-invalid');
  });

  it('un 422 sin detalles muestra el mensaje de la API como aviso general', async () => {
    stubFormApi({
      post: () => errorResponse(422, 'validation_error', 'Algunos campos no son válidos.'),
    });
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Algunos campos no son válidos.');
  });

  it('un error de red conserva lo escrito y permite reintentar', async () => {
    let attempts = 0;
    const api = stubFormApi({
      post: (body) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return jsonResponse(makeApplication({ ...(body as object), id: 5 }), 201);
      },
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.type(fields.notes(), 'Mis notas');

    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(alert).toHaveFocus();
    expect(fields.company()).toHaveValue('Oracle');
    expect(fields.position()).toHaveValue('Becario de Software');
    expect(fields.notes()).toHaveValue('Mis notas');
    expect(submitButton()).toBeEnabled();

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error 500 muestra el mensaje de la API y no navega', async () => {
    stubFormApi({
      post: () => errorResponse(500, 'internal_error', 'Ocurrió un error inesperado.'),
    });
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado.');
    expect(router.state.location.pathname).toBe('/applications/new');
  });
});

describe('Nueva postulación: salir sin guardar', () => {
  it('Cancelar vuelve a la lista con los mismos filtros, sin guardar', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '/?q=oracle&sort=company' },
    });
    await fillRequired(user);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?q=oracle&sort=company');
    expect(api.callsTo('POST')).toHaveLength(0);
  });

  it('el enlace "Volver a postulaciones" lleva a la lista con los mismos filtros', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders({
      pathname: '/applications/new',
      state: { returnTo: '/?status=offer' },
    });
    const back = screen.getByRole('link', { name: /Volver a postulaciones/ });
    expect(back).toHaveAttribute('href', '/?status=offer');

    await user.click(back);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?status=offer');
  });

  it('desde la lista: "+ Nueva postulación" abre el formulario y Cancelar regresa con los filtros', async () => {
    stubFormApi();
    const { user, router } = renderWithProviders('/?status=interview&page=2');

    await user.click(await screen.findByRole('link', { name: '+ Nueva postulación' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nueva postulación' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?status=interview&page=2');
  });
});
