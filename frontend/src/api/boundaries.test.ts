/**
 * Bordes del cliente de la API (issue #12): valores raros en filtros e ids, y respuestas que no
 * cumplen el contrato. Las pruebas marcadas CARACTERIZACIÓN fijan lo que el cliente hace hoy, no
 * necesariamente lo ideal; si el comportamiento cambia a propósito, hay que actualizarlas.
 */
import { describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, makeApplication, makeApplicationList } from '../test/api';
import {
  ApiError,
  compactFilters,
  createApplication,
  deleteApplication,
  getApplication,
  getStats,
  listApplications,
  updateApplication,
} from './client';
import type { Application, ApplicationFilters } from './types';

function stubFetch(response: () => Response = () => jsonResponse(makeApplicationList())) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastUrl(fetchMock: ReturnType<typeof stubFetch>): string {
  return String(fetchMock.mock.lastCall?.[0]);
}

/** Parámetros de la última URL, ya decodificados. */
function lastParams(fetchMock: ReturnType<typeof stubFetch>): URLSearchParams {
  return new URL(lastUrl(fetchMock), 'http://localhost').searchParams;
}

describe('listApplications: números en los filtros', () => {
  it('page: 0 se manda (el 0 no cuenta como "vacío"); la API decide si es válido', async () => {
    const fetchMock = stubFetch();
    await listApplications({ page: 0 });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?page=0');
  });

  it('per_page grande (1000) y negativo se mandan tal cual, sin recortar a 1..100', async () => {
    const fetchMock = stubFetch();
    await listApplications({ per_page: 1000 });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?per_page=1000');
    await listApplications({ per_page: -5, page: -1 });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?page=-1&per_page=-5');
  });

  it('el 422 de la API por page/per_page fuera de rango llega con sus details', async () => {
    stubFetch(() =>
      errorResponse(422, 'validation_error', 'Algunos parámetros no son válidos.', {
        per_page: ['Debe estar entre 1 y 100.'],
      }),
    );
    const error = await listApplications({ per_page: 1000 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      details: { per_page: ['Debe estar entre 1 y 100.'] },
    });
  });

  // CARACTERIZACIÓN: el cliente no valida; NaN e Infinity se vuelven texto y se mandan.
  it('CARACTERIZACIÓN: page NaN o Infinity se mandan como "NaN" / "Infinity"', async () => {
    const fetchMock = stubFetch();
    await listApplications({ page: Number.NaN, per_page: Number.POSITIVE_INFINITY });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?page=NaN&per_page=Infinity');
  });

  it('page decimal se manda con su punto', async () => {
    const fetchMock = stubFetch();
    await listApplications({ page: 1.5 });
    expect(lastParams(fetchMock).get('page')).toBe('1.5');
  });
});

describe('listApplications: texto de búsqueda (q)', () => {
  it.each([
    ['acentos y ñ', 'ingeniería Ñandú'],
    ['emoji', 'dev 🚀'],
    ['emoji compuesto (familia con ZWJ)', '👨‍👩‍👧'],
    ['CJK', '工程师'],
    ['caracteres reservados de URL', 'a&b=c?d#e/f+g%h'],
    ['comodines de SQL, que la API busca como texto', '100%_literal'],
    ['comillas y saltos de línea', 'a"b\'c\nd'],
  ])('%s: sobrevive al viaje de ida (URL) sin perder nada', async (_name, q) => {
    const fetchMock = stubFetch();

    await listApplications({ q, status: 'offer' });

    // Si se codificó bien, al decodificar sale el mismo texto y no se coló ningún otro parámetro.
    const params = lastParams(fetchMock);
    expect(params.get('q')).toBe(q);
    expect([...params.keys()].sort()).toEqual(['q', 'status']);
    expect(lastUrl(fetchMock)).not.toMatch(/[^\x20-\x7e]/); // la URL es ASCII puro
  });

  it('los espacios viajan como "+", que Flask decodifica como espacio', async () => {
    const fetchMock = stubFetch();
    await listApplications({ q: 'data analyst' });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?q=data+analyst');
  });

  it('un emoji se codifica como UTF-8 (4 bytes), no como pares sustitutos', async () => {
    const fetchMock = stubFetch();
    await listApplications({ q: '🚀' });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?q=%F0%9F%9A%80');
  });

  // El tope de 100 caracteres lo valida la API (422); el cliente no lo recorta.
  it('una búsqueda de más de 100 caracteres se manda completa', async () => {
    const fetchMock = stubFetch();
    const q = 'x'.repeat(101);
    await listApplications({ q });
    expect(lastParams(fetchMock).get('q')).toBe(q);
  });

  // CARACTERIZACIÓN: solo '' cuenta como vacío. Un q de solo espacios no se quita; lo que haga la
  // API con él (¿lo recorta como a los campos del POST?) no está en el spec.
  it('CARACTERIZACIÓN: q de solo espacios NO se descarta y viaja como "+++"', async () => {
    const fetchMock = stubFetch();
    await listApplications({ q: '   ' });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?q=+++');
  });
});

describe('listApplications: undefined contra cadena vacía', () => {
  it('undefined y "" producen exactamente la misma URL y la misma llave de caché', async () => {
    const fetchMock = stubFetch();

    await listApplications({ q: undefined, applied_from: undefined });
    const withUndefined = lastUrl(fetchMock);
    await listApplications({ q: '', applied_from: '' });
    const withEmpty = lastUrl(fetchMock);
    await listApplications({});
    const withNothing = lastUrl(fetchMock);

    expect(withUndefined).toBe('/api/v1/applications');
    expect(withEmpty).toBe(withUndefined);
    expect(withNothing).toBe(withUndefined);
    expect(compactFilters({ q: '' })).toStrictEqual(compactFilters({ q: undefined }));
    expect(compactFilters({ q: '' })).toStrictEqual({});
  });

  it('sort y fechas vacías se descartan igual (un `?sort=` daría 422 si llegara a la API)', async () => {
    const fetchMock = stubFetch();
    await listApplications({ sort: '' as ApplicationFilters['sort'], applied_to: '' });
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications');
  });

  it('no muta el objeto de filtros que recibe', async () => {
    stubFetch();
    const filters: ApplicationFilters = { q: '', status: 'offer', page: undefined };
    const copy = structuredClone(filters);
    await listApplications(filters);
    expect(filters).toStrictEqual(copy);
  });

  // CARACTERIZACIÓN: `null` no es un valor de los tipos, pero un llamador sin tipos (o un cast)
  // lo puede pasar. Se manda como el texto "null": la API respondería 422 por un `status`
  // desconocido, o buscaría la palabra "null".
  it('CARACTERIZACIÓN: un null en tiempo de ejecución se manda como el texto "null"', async () => {
    const fetchMock = stubFetch();
    await listApplications({ q: null, status: null } as unknown as ApplicationFilters);
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?status=null&q=null');
  });

  it('los parámetros desconocidos que se cuelen no viajan', async () => {
    const fetchMock = stubFetch();
    await listApplications({ q: 'a', foo: 'bar', __proto__: { x: 1 } } as ApplicationFilters);
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications?q=a');
  });
});

describe('ids de getApplication, updateApplication y deleteApplication', () => {
  // El tipo dice `number`, pero un `id` viene de la URL (`useParams`, texto) y alguien lo convierte
  // con Number(): ahí salen NaN, 0, negativos y decimales. El cliente no los valida: arma la ruta
  // con lo que reciba y la API contesta 404 (sus rutas esperan un entero positivo).
  it.each([
    ['0', 0, '/api/v1/applications/0'],
    ['negativo', -1, '/api/v1/applications/-1'],
    ['decimal', 1.5, '/api/v1/applications/1.5'],
    ['NaN', Number.NaN, '/api/v1/applications/NaN'],
    ['Infinity', Number.POSITIVE_INFINITY, '/api/v1/applications/Infinity'],
    ['-0', -0, '/api/v1/applications/0'],
    [
      'entero enorme (> 2^53, pierde precisión)',
      2 ** 60,
      '/api/v1/applications/1152921504606847000',
    ],
    ['1e21 (notación científica)', 1e21, '/api/v1/applications/1e+21'],
  ])('CARACTERIZACIÓN: id %s arma %s sin validar', async (_name, id, url) => {
    const fetchMock = stubFetch(() => errorResponse(404, 'not_found', 'No existe.'));

    const errors = await Promise.all([
      getApplication(id).catch((e: unknown) => e),
      updateApplication(id, { status: 'offer' }).catch((e: unknown) => e),
      deleteApplication(id).catch((e: unknown) => e),
    ]);

    expect(fetchMock.mock.calls.map(([called]) => String(called))).toEqual([url, url, url]);
    // Sin red de por medio, el 404 llega como ApiError normal.
    for (const error of errors) expect(error).toMatchObject({ status: 404, code: 'not_found' });
  });

  // CARACTERIZACIÓN: con un tipo que miente (un texto donde va un número), el id se concatena
  // sin codificar. Un texto con "/" o ".." cambia la ruta que se pide.
  it('CARACTERIZACIÓN: un id de texto con "../" se concatena sin codificar', async () => {
    const fetchMock = stubFetch();
    await getApplication('1/../stats' as unknown as number);
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications/1/../stats');
  });

  it('CARACTERIZACIÓN: un id undefined arma /applications/undefined', async () => {
    const fetchMock = stubFetch();
    await getApplication(undefined as unknown as number);
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications/undefined');
  });

  it('un id válido sigue armando la ruta esperada', async () => {
    const fetchMock = stubFetch(() => jsonResponse(makeApplication({ id: 7 })));
    await getApplication(7);
    expect(lastUrl(fetchMock)).toBe('/api/v1/applications/7');
  });
});

describe('PATCH y POST: el cuerpo viaja como lo recibe', () => {
  it('un PATCH vacío ({}) se manda: la API responde 422 con details.body', async () => {
    const fetchMock = stubFetch(() =>
      errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
        body: ['Envía al menos un campo.'],
      }),
    );
    const error = await updateApplication(1, {}).catch((e: unknown) => e);
    expect(fetchMock.mock.lastCall?.[1]?.body).toBe('{}');
    expect(error).toMatchObject({ status: 422, details: { body: ['Envía al menos un campo.'] } });
  });

  it('en el PATCH, undefined se omite del JSON y null se conserva (null vacía el campo)', async () => {
    const fetchMock = stubFetch(() => jsonResponse(makeApplication()));
    await updateApplication(1, { notes: null, source: undefined, status: 'offer' });
    expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toStrictEqual({
      notes: null,
      status: 'offer',
    });
  });

  it('un texto muy largo (5001 caracteres en notes) se manda completo; la API lo rechaza', async () => {
    const fetchMock = stubFetch(() => jsonResponse(makeApplication()));
    const notes = 'n'.repeat(5001);
    await createApplication({ company: 'A', position: 'B', notes });
    expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body)).notes).toHaveLength(5001);
  });
});

describe('respuestas que no cumplen el tipo (el cliente no valida el JSON)', () => {
  // Todas son CARACTERIZACIÓN: el cliente hace `response.json() as T` y confía en el contrato.
  // Lo que garantiza es el formato de los *errores*, no el de los éxitos.

  it('CARACTERIZACIÓN: campos extra se conservan tal cual (no se filtran)', async () => {
    stubFetch(() => jsonResponse({ ...makeApplication(), salary: 50000, internal: { a: 1 } }));
    const application = await getApplication(42);
    expect(application).toMatchObject({ salary: 50000, internal: { a: 1 } });
  });

  it('CARACTERIZACIÓN: campos extra en la lista y en las estadísticas también pasan', async () => {
    stubFetch(() => jsonResponse({ ...makeApplicationList(), next_cursor: 'abc' }));
    expect(await listApplications()).toHaveProperty('next_cursor', 'abc');
    stubFetch(() => jsonResponse({ total: 0, extra: true }));
    expect(await getStats()).toHaveProperty('extra', true);
  });

  it('CARACTERIZACIÓN: null donde el tipo no lo permite pasa sin error (el tipo miente)', async () => {
    stubFetch(() => jsonResponse({ ...makeApplication(), applied_on: null, company: null }));
    const application: Application = await getApplication(42);
    // TypeScript dice `string`; en ejecución es null y `application.company.trim()` fallaría.
    expect(application.applied_on).toBeNull();
    expect(application.company).toBeNull();
  });

  it('CARACTERIZACIÓN: faltan campos obligatorios y no se avisa', async () => {
    stubFetch(() => jsonResponse({ id: 1 }));
    const application = await getApplication(1);
    expect(application).toStrictEqual({ id: 1 });
    expect(application.company).toBeUndefined();
  });

  it('CARACTERIZACIÓN: una lista sin `items` se entrega sin `items` (`.items.map` rompería en la pantalla)', async () => {
    stubFetch(() => jsonResponse({ page: 1, per_page: 20, total: 0, pages: 0 }));
    const list = await listApplications();
    expect(list.items).toBeUndefined();
  });

  it('CARACTERIZACIÓN: un estado desconocido ("hired") pasa tal cual', async () => {
    stubFetch(() => jsonResponse({ ...makeApplication(), status: 'hired' }));
    expect((await getApplication(42)).status).toBe('hired');
  });

  it('CARACTERIZACIÓN: un 200 con JSON `null` resuelve con null (no es unexpected_response)', async () => {
    stubFetch(() => new Response('null', { status: 200 }));
    await expect(getApplication(1)).resolves.toBeNull();
  });

  it('CARACTERIZACIÓN: un 200 con un arreglo o un texto se entrega como si fuera el objeto', async () => {
    stubFetch(() => jsonResponse([]));
    await expect(getStats()).resolves.toStrictEqual([]);
    stubFetch(() => jsonResponse('hola'));
    await expect(getStats()).resolves.toBe('hola');
  });

  it('CARACTERIZACIÓN: un 204 donde se esperaba un objeto resuelve con undefined', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(getApplication(1)).resolves.toBeUndefined();
  });

  it('un 200 sin cuerpo en un GET sí falla, como unexpected_response', async () => {
    stubFetch(() => new Response('', { status: 200 }));
    await expect(getApplication(1)).rejects.toMatchObject({
      status: 200,
      code: 'unexpected_response',
    });
  });

  // El caso más delicado: el servidor creó la postulación pero la respuesta no se pudo leer.
  it('CARACTERIZACIÓN: un 201 sin JSON legible falla aunque la postulación ya se creó', async () => {
    stubFetch(
      () => new Response('', { status: 201, headers: { Location: '/api/v1/applications/9' } }),
    );
    await expect(createApplication({ company: 'A', position: 'B' })).rejects.toMatchObject({
      status: 201,
      code: 'unexpected_response',
    });
  });

  it('deleteApplication ignora el cuerpo de un 200 (la API manda 204)', async () => {
    stubFetch(() => jsonResponse({ deleted: true }));
    await expect(deleteApplication(1)).resolves.toBeUndefined();
  });
});

describe('errores que no cumplen el formato', () => {
  it('CARACTERIZACIÓN: un código de error desconocido se conserva aunque no esté en ApiErrorCode', async () => {
    stubFetch(() => errorResponse(429, 'rate_limited', 'Demasiadas peticiones.'));
    const error = await getStats().catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'Demasiadas peticiones.',
    });
  });

  it('CARACTERIZACIÓN: `details` con una forma rara se guarda sin validar', async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: 'validation_error', message: 'x', details: 'texto' } }, 422),
    );
    const error = await getStats().catch((e: unknown) => e);
    expect((error as ApiError).details).toBe('texto');
  });

  it('un error con `code` o `message` que no son texto cae en unexpected_response', async () => {
    stubFetch(() => jsonResponse({ error: { code: 42, message: 'x' } }, 422));
    await expect(getStats()).rejects.toMatchObject({ status: 422, code: 'unexpected_response' });
    stubFetch(() => jsonResponse({ error: { code: 'not_found' } }, 404));
    await expect(getStats()).rejects.toMatchObject({ status: 404, code: 'unexpected_response' });
    stubFetch(() => jsonResponse({ error: null }, 500));
    await expect(getStats()).rejects.toMatchObject({ status: 500, code: 'unexpected_response' });
  });

  it('un cuerpo de error que es `null` o un arreglo no rompe el cliente', async () => {
    stubFetch(() => new Response('null', { status: 500 }));
    await expect(getStats()).rejects.toMatchObject({ code: 'unexpected_response' });
    stubFetch(() => jsonResponse([], 500));
    await expect(getStats()).rejects.toMatchObject({ code: 'unexpected_response' });
  });

  it('un 3xx que fetch no siguió (p. ej. opaque) cae en unexpected_response, sin cuerpo que leer', async () => {
    stubFetch(() => new Response(null, { status: 304 }));
    await expect(getStats()).rejects.toMatchObject({ status: 304, code: 'unexpected_response' });
  });
});
