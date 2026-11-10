/**
 * Aceptación de la issue #14, HU-01 (registrar) por la pantalla: bordes de largo (120/121, 500/501,
 * 5000/5001), emoji y caracteres combinados, URL, cuerpo mínimo, y textos hostiles que deben viajar
 * tal cual y mostrarse como texto. Las mismas reglas por función están en `validation.edge.test.ts`.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, makeApplication, makeApplicationList, makeStats } from '../../test/api';
import { stubFormApi } from '../../test/formApi';
import { describedText, fields, setLocalNow } from '../../test/formUtils';
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

describe('HU-01: cuerpo mínimo y valores por defecto', () => {
  it('con solo empresa y puesto manda el estado Postulado y la fecha de hoy, y nada más', async () => {
    setLocalNow(2026, 11, 10, 22, 45);
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toEqual({
      company: 'Oracle',
      position: 'Becario de Software',
      status: 'applied',
      applied_on: '2026-11-10',
    });
  });

  it('el estado por defecto se ve como "Postulado" (no "applied")', () => {
    stubFormApi();
    renderWithProviders('/applications/new');
    expect(fields.status()).toHaveDisplayValue('Postulado');
  });

  it.each(['interview', 'offer', 'rejected'] as const)(
    'elegir %s lo manda en el cuerpo',
    async (status) => {
      const api = stubFormApi();
      const { user, router } = renderWithProviders('/applications/new');
      await fillRequired(user);
      await user.selectOptions(fields.status(), status);

      await user.click(submitButton());

      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(api.callsTo('POST')[0].body).toMatchObject({ status });
    },
  );

  it('el cuerpo nunca lleva id, created_at ni updated_at', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    expect(Object.keys(api.callsTo('POST')[0].body as object)).not.toEqual(
      expect.arrayContaining(['id']),
    );
    expect(api.callsTo('POST')[0].body).not.toHaveProperty('created_at');
    expect(api.callsTo('POST')[0].body).not.toHaveProperty('updated_at');
  });

  it('la petición lleva Content-Type JSON (sin él la API responde 415)', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    const post = api.fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(new Headers(post[1]!.headers).get('Content-Type')).toBe('application/json');
  });
});

describe('HU-01: 120 contra 121 caracteres por la pantalla', () => {
  const OVER = 'Máximo 120 caracteres.';

  it.each(['company', 'position'] as const)(
    '%s: 120 se envía y 121 se rechaza junto al campo',
    async (name) => {
      const api = stubFormApi();
      const { user, router } = renderWithProviders('/applications/new');
      await fillRequired(user);
      const control = fields[name === 'company' ? 'company' : 'position'];

      fireEvent.change(control(), { target: { value: 'x'.repeat(121) } });
      await user.click(submitButton());
      expect(api.callsTo('POST')).toHaveLength(0);
      expect(describedText(control())).toContain(OVER);
      expect(control()).toHaveFocus();

      fireEvent.change(control(), { target: { value: 'x'.repeat(120) } });
      expect(control()).not.toHaveAttribute('aria-invalid');
      await user.click(submitButton());
      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(api.callsTo('POST')[0].body).toMatchObject({ [name]: 'x'.repeat(120) });
    },
  );

  it('120 letras con espacios alrededor se envían recortadas; 121 recortadas se rechazan', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.company(), { target: { value: `  ${'x'.repeat(121)}  ` } });
    await user.click(submitButton());
    expect(describedText(fields.company())).toContain(OVER);

    fireEvent.change(fields.company(), { target: { value: `  ${'x'.repeat(120)}  ` } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ company: 'x'.repeat(120) });
  });

  it('120 emoji se envían; 121 se rechazan (la API cuenta puntos de código)', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.company(), { target: { value: '😀'.repeat(121) } });
    await user.click(submitButton());
    expect(describedText(fields.company())).toContain(OVER);
    expect(api.callsTo('POST')).toHaveLength(0);

    fireEvent.change(fields.company(), { target: { value: '😀'.repeat(120) } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ company: '😀'.repeat(120) });
  });

  it('60 "é" descompuestas (e + acento = 120 puntos de código) se envían; 61 se rechazan', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    const decomposed = 'é';

    fireEvent.change(fields.position(), { target: { value: decomposed.repeat(61) } });
    await user.click(submitButton());
    expect(describedText(fields.position())).toContain(OVER);

    fireEvent.change(fields.position(), { target: { value: decomposed.repeat(60) } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ position: decomposed.repeat(60) });
  });

  it.each([' ', '   ', '\t', '\t \t', ' ', '　'])(
    'empresa con solo espacios en blanco (%j) se rechaza como obligatoria',
    async (blank) => {
      const api = stubFormApi();
      const { user } = renderWithProviders('/applications/new');
      fireEvent.change(fields.company(), { target: { value: blank } });
      await user.type(fields.position(), 'Dev');

      await user.click(submitButton());

      expect(describedText(fields.company())).toContain('Este campo es obligatorio.');
      expect(fields.company()).toHaveFocus();
      expect(api.callsTo('POST')).toHaveLength(0);
    },
  );

  it('un salto de línea dentro de la empresa no llega a la API', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await user.type(fields.position(), 'Dev');
    fireEvent.change(fields.company(), { target: { value: 'Ora\ncle\r\n' } });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((api.callsTo('POST')[0].body as { company: string }).company).not.toMatch(/[\r\n]/);
  });
});

describe('HU-01: enlace, fuente y notas por la pantalla', () => {
  const URL_MESSAGE = 'Escribe una URL válida que empiece con http:// o https://.';

  it.each([
    'HTTP://MAYÚSCULAS.COM',
    'https://user:pass@host',
    'http://localhost',
    'https://a.co',
    'http://[::1]:5173/',
  ])('la URL %j se acepta y se envía', async (url) => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.jobUrl(), { target: { value: url } });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((api.callsTo('POST')[0].body as { job_url: string }).job_url).toBe(url);
  });

  it.each([
    'http://',
    'https://',
    '//x.com',
    'https://exa mple.com',
    'HTTP:/x.com',
    'https:\\\\x.com',
  ])('la URL %j se rechaza con el mensaje junto al campo', async (url) => {
    const api = stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.jobUrl(), { target: { value: url } });

    await user.click(submitButton());

    expect(describedText(fields.jobUrl())).toContain(URL_MESSAGE);
    expect(fields.jobUrl()).toHaveFocus();
    expect(api.callsTo('POST')).toHaveLength(0);
  });

  it('500 caracteres de URL se envían y 501 se rechazan', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    const prefix = 'https://example.com/';

    fireEvent.change(fields.jobUrl(), {
      target: { value: prefix + 'a'.repeat(501 - prefix.length) },
    });
    await user.click(submitButton());
    expect(describedText(fields.jobUrl())).toContain('Máximo 500 caracteres.');

    fireEvent.change(fields.jobUrl(), {
      target: { value: prefix + 'a'.repeat(500 - prefix.length) },
    });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toHaveProperty('job_url');
  });

  it('fuente: 60 se envían, 61 se rechazan', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.source(), { target: { value: 'f'.repeat(61) } });
    await user.click(submitButton());
    expect(describedText(fields.source())).toContain('Máximo 60 caracteres.');
    // La ayuda "Dónde encontraste la vacante." se conserva junto al error.
    expect(describedText(fields.source())).toContain('Dónde encontraste la vacante.');

    fireEvent.change(fields.source(), { target: { value: 'f'.repeat(60) } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ source: 'f'.repeat(60) });
  });

  it('notas: 5000 se envían, 5001 se rechazan, y el contador sigue contando', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.notes(), { target: { value: 'n'.repeat(5001) } });
    await user.click(submitButton());
    expect(describedText(fields.notes())).toContain('Máximo 5000 caracteres.');
    expect(screen.getByText('5001 de 5000 caracteres')).toBeInTheDocument();

    fireEvent.change(fields.notes(), { target: { value: 'n'.repeat(5000) } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect((api.callsTo('POST')[0].body as { notes: string }).notes).toHaveLength(5000);
  });

  it('las notas conservan sus saltos de línea y sangrías internas; solo se recortan los extremos', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.notes(), {
      target: { value: '\n\n  Línea 1\n    Línea 2\n\n  Línea 3  \n\n' },
    });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({
      notes: 'Línea 1\n    Línea 2\n\n  Línea 3',
    });
  });

  it('un error de enlace y otro de notas se ven a la vez, cada uno en su campo, y el foco va al enlace', async () => {
    stubFormApi();
    const { user } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.jobUrl(), { target: { value: 'ftp://x' } });
    fireEvent.change(fields.notes(), { target: { value: 'n'.repeat(5001) } });

    await user.click(submitButton());

    expect(describedText(fields.jobUrl())).toContain(URL_MESSAGE);
    expect(describedText(fields.notes())).toContain('Máximo 5000 caracteres.');
    expect(fields.jobUrl()).toHaveFocus();
  });
});

describe('HU-01: fecha', () => {
  it('no se puede enviar mañana (mensaje junto al campo) y hoy sí', async () => {
    setLocalNow(2026, 3, 1, 12, 0);
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    fireEvent.change(fields.appliedOn(), { target: { value: '2026-03-02' } });
    await user.click(submitButton());
    expect(describedText(fields.appliedOn())).toContain('La fecha no puede ser futura.');
    expect(fields.appliedOn()).toHaveFocus();
    expect(api.callsTo('POST')).toHaveLength(0);

    fireEvent.change(fields.appliedOn(), { target: { value: '2026-03-01' } });
    await user.click(submitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('una fecha pasada lejana se envía tal cual', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    fireEvent.change(fields.appliedOn(), { target: { value: '1999-12-31' } });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ applied_on: '1999-12-31' });
  });

  it('el 29 de febrero de un año bisiesto es válido como "hoy"', async () => {
    setLocalNow(2028, 2, 29, 23, 59);
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ applied_on: '2028-02-29' });
  });
});

describe('textos hostiles: viajan tal cual y se muestran como texto', () => {
  const HOSTILE = [
    '<script>window.__pwned = 1</script>',
    '<img src=x onerror="window.__pwned = 2">',
    '"><svg onload="window.__pwned = 3">',
    "'; DROP TABLE applications; --",
    '{{7*7}} ${7*7} %s %d',
    'Ñandú 🚀 日本語 العربية',
    '👨‍👩‍👧 é',
  ];

  it.each(HOSTILE)('%j en empresa, puesto, fuente y notas se envía tal cual', async (text) => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    fireEvent.change(fields.company(), { target: { value: text } });
    fireEvent.change(fields.position(), { target: { value: text } });
    fireEvent.change(fields.source(), { target: { value: text } });
    fireEvent.change(fields.notes(), { target: { value: text } });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({
      company: text,
      position: text,
      source: text,
      notes: text,
    });
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('una URL con <script> en la ruta es sintaxis válida y se envía codificada por JSON, no ejecutada', async () => {
    const api = stubFormApi();
    const { user, router } = renderWithProviders('/applications/new');
    await fillRequired(user);
    const url = 'https://example.com/?q=<script>alert(1)</script>';
    fireEvent.change(fields.jobUrl(), { target: { value: url } });

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.callsTo('POST')[0].body).toMatchObject({ job_url: url });
  });

  it.each(HOSTILE)(
    'al editar, %j se muestra como texto en los campos y no crea elementos',
    async (text) => {
      stubFormApi({
        get: (id) =>
          jsonResponse(
            makeApplication({
              id,
              company: text,
              position: text,
              source: text,
              notes: text,
              job_url: null,
            }),
          ),
      });
      renderWithProviders('/applications/42/edit');
      const form = await screen.findByRole('form', { name: 'Editar postulación' });

      expect(fields.company()).toHaveValue(text);
      expect(fields.position()).toHaveValue(text);
      expect(fields.source()).toHaveValue(text);
      expect(fields.notes()).toHaveValue(text);
      expect(form.querySelector('script, img, svg')).toBeNull();
      expect(document.querySelector('script:not([src])')).toBeNull();
      expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    },
  );

  it('una notas con </textarea> se muestra completa y no rompe el formulario', async () => {
    const text = '</textarea><button>falso</button> fin';
    stubFormApi({ get: (id) => jsonResponse(makeApplication({ id, notes: text })) });
    renderWithProviders('/applications/42/edit');
    const form = await screen.findByRole('form', { name: 'Editar postulación' });

    expect(fields.notes()).toHaveValue(text);
    expect(within(form).queryByRole('button', { name: 'falso' })).not.toBeInTheDocument();
  });

  it('guardar un texto hostil y volver a la lista lo muestra como texto en la tabla', async () => {
    const text = '<img src=x onerror="window.__pwned = 4"> 🚀';
    const items: ReturnType<typeof makeApplication>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/v1/stats')
          return jsonResponse(makeStats({ total: items.length }));
        if (init?.method === 'POST') {
          const created = makeApplication({ ...JSON.parse(String(init.body)), id: 1 });
          items.push(created);
          return jsonResponse(created, 201);
        }
        return jsonResponse(makeApplicationList(items));
      }),
    );
    const { user, router } = renderWithProviders('/applications/new');
    fireEvent.change(fields.company(), { target: { value: text } });
    await user.type(fields.position(), 'Dev');

    await user.click(submitButton());

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const table = await screen.findByRole('table', { name: 'Postulaciones' });
    await waitFor(() =>
      expect(within(table).getAllByText(text, { exact: false }).length).toBeGreaterThan(0),
    );
    expect(table.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
