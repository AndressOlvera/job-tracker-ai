import { describe, expect, it, vi } from 'vitest';
import {
  errorResponse,
  jsonResponse,
  makeApplication,
  makeApplicationList,
  makeStats,
} from '../test/api';
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  UNEXPECTED_RESPONSE_MESSAGE,
  compactFilters,
  createApplication,
  deleteApplication,
  getApplication,
  getHealth,
  getStats,
  listApplications,
  updateApplication,
} from './client';
import { shouldRetry } from './queryClient';

/**
 * Simula `fetch` con una respuesta por llamada; lo que no sea `Response` se lanza como error.
 * (En jsdom un `DOMException` no es `instanceof Error`, por eso se pregunta por `Response`.)
 */
function stubFetch(...results: (Response | Error | DOMException)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const result of results) {
    if (result instanceof Response) fetchMock.mockResolvedValueOnce(result);
    else fetchMock.mockRejectedValueOnce(result);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** URL, método, encabezados y cuerpo de la última petición. */
function lastRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init = {}] = fetchMock.mock.lastCall ?? [];
  return {
    url: String(url),
    method: init.method,
    headers: new Headers(init.headers),
    body: init.body,
    signal: init.signal,
  };
}

/** Espera a que la promesa falle y devuelve el error (para revisar sus campos). */
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La petición debía fallar y no falló.');
}

describe('cliente de la API: rutas y métodos', () => {
  it.each([
    ['getHealth', () => getHealth(), 'GET', '/api/v1/health', { status: 'ok', database: 'ok' }],
    [
      'getApplication',
      () => getApplication(42),
      'GET',
      '/api/v1/applications/42',
      makeApplication(),
    ],
    ['getStats', () => getStats(), 'GET', '/api/v1/stats', makeStats()],
    [
      'createApplication',
      () => createApplication({ company: 'Oracle', position: 'Becario' }),
      'POST',
      '/api/v1/applications',
      makeApplication(),
    ],
    [
      'updateApplication',
      () => updateApplication(42, { status: 'offer' }),
      'PATCH',
      '/api/v1/applications/42',
      makeApplication({ status: 'offer' }),
    ],
  ])('%s → %s %s y devuelve el JSON', async (_name, call, method, url, body) => {
    const fetchMock = stubFetch(jsonResponse(body));

    await expect(call()).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest(fetchMock)).toMatchObject({ url, method });
  });

  it('usa rutas relativas al mismo origen (ADR-005)', async () => {
    const fetchMock = stubFetch(jsonResponse(makeStats()));

    await getStats();

    expect(lastRequest(fetchMock).url).toMatch(/^\/api\/v1\//);
  });

  it('un GET pide JSON y no manda cuerpo ni Content-Type', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplication()));

    await getApplication(42);

    const request = lastRequest(fetchMock);
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.has('Content-Type')).toBe(false);
    expect(request.body).toBeUndefined();
  });

  it.each([
    ['getHealth', (signal: AbortSignal) => getHealth(signal)],
    ['listApplications', (signal: AbortSignal) => listApplications({}, signal)],
    ['getApplication', (signal: AbortSignal) => getApplication(42, signal)],
    ['getStats', (signal: AbortSignal) => getStats(signal)],
  ])('%s pasa el AbortSignal a fetch', async (_name, call) => {
    const fetchMock = stubFetch(jsonResponse({}));
    const controller = new AbortController();

    await call(controller.signal);

    expect(lastRequest(fetchMock).signal).toBe(controller.signal);
  });
});

describe('listApplications', () => {
  it('sin filtros pide la lista sin query string', async () => {
    const list = makeApplicationList();
    const fetchMock = stubFetch(jsonResponse(list));

    await expect(listApplications()).resolves.toEqual(list);

    expect(lastRequest(fetchMock)).toMatchObject({ url: '/api/v1/applications', method: 'GET' });
  });

  it('combina todos los filtros en un orden fijo, sin importar el del objeto', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplicationList()));

    await listApplications({
      per_page: 50,
      page: 2,
      sort: '-company',
      applied_to: '2026-09-30',
      applied_from: '2026-09-01',
      q: 'data',
      status: 'interview',
    });

    expect(lastRequest(fetchMock).url).toBe(
      '/api/v1/applications?status=interview&q=data&applied_from=2026-09-01' +
        '&applied_to=2026-09-30&sort=-company&page=2&per_page=50',
    );
  });

  it('omite los filtros vacíos o sin definir', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplicationList()));

    await listApplications({
      status: undefined,
      q: '',
      applied_from: '',
      applied_to: undefined,
      sort: 'company',
    });

    expect(lastRequest(fetchMock).url).toBe('/api/v1/applications?sort=company');
  });

  it('si todos los filtros están vacíos no agrega `?`', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplicationList()));

    await listApplications({ q: '', status: undefined });

    expect(lastRequest(fetchMock).url).toBe('/api/v1/applications');
  });

  it('codifica %, &, espacios y acentos en la búsqueda', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplicationList()));
    const q = '50% & más_datos=sí';

    await listApplications({ q, page: 1 });

    const { url } = lastRequest(fetchMock);
    expect(url).toBe('/api/v1/applications?q=50%25+%26+m%C3%A1s_datos%3Ds%C3%AD&page=1');
    // Al decodificarla, la API recibe exactamente lo que se escribió y ningún parámetro extra.
    const params = new URL(url, 'http://localhost').searchParams;
    expect(params.get('q')).toBe(q);
    expect([...params.keys()]).toEqual(['q', 'page']);
  });
});

describe('compactFilters', () => {
  it('quita los vacíos y conserva los demás, incluido el 0', () => {
    expect(compactFilters({ q: '', status: 'offer', page: 0, sort: undefined })).toEqual({
      status: 'offer',
      page: 0,
    });
  });

  it('ignora llaves que no son filtros de la API', () => {
    const filters = { q: 'data', extra: 'x' } as Parameters<typeof compactFilters>[0];
    expect(compactFilters(filters)).toEqual({ q: 'data' });
  });
});

describe('POST y PATCH', () => {
  it('createApplication manda el cuerpo como JSON con sus encabezados', async () => {
    const input = {
      company: 'Oracle',
      position: 'Becario de Ingeniería de Software',
      job_url: 'https://www.occ.com.mx/empleo/oferta/12345',
      source: 'OCC',
    };
    const created = makeApplication();
    const fetchMock = stubFetch(jsonResponse(created, 201));

    await expect(createApplication(input)).resolves.toEqual(created);

    const request = lastRequest(fetchMock);
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(JSON.parse(String(request.body))).toEqual(input);
  });

  it('updateApplication manda `null` para vaciar un campo', async () => {
    const fetchMock = stubFetch(jsonResponse(makeApplication({ status: 'offer', notes: null })));

    await updateApplication(42, { status: 'offer', notes: null });

    const request = lastRequest(fetchMock);
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(request.body).toBe('{"status":"offer","notes":null}');
  });
});

describe('deleteApplication', () => {
  it('resuelve con el 204 sin intentar leer un cuerpo', async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, 'json');
    const fetchMock = stubFetch(response);

    await expect(deleteApplication(42)).resolves.toBeUndefined();

    expect(lastRequest(fetchMock)).toMatchObject({
      url: '/api/v1/applications/42',
      method: 'DELETE',
    });
    expect(lastRequest(fetchMock).headers.has('Content-Type')).toBe(false);
    expect(json).not.toHaveBeenCalled();
  });
});

describe('errores de la API', () => {
  it('un 422 trae código, mensaje y errores por campo', async () => {
    const details = {
      company: ['Este campo es obligatorio.'],
      applied_on: ['La fecha no puede ser futura.'],
    };
    stubFetch(errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', details));

    const error = await errorOf(createApplication({ company: '', position: 'Becario' }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'validation_error',
      message: 'Algunos campos no son válidos.',
      details,
    });
  });

  it('un PATCH vacío trae el error de todo el cuerpo en `details.body`', async () => {
    stubFetch(
      errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {
        body: ['Envía al menos un campo.'],
      }),
    );

    const error = await errorOf(updateApplication(42, {}));

    expect(error).toMatchObject({ details: { body: ['Envía al menos un campo.'] } });
  });

  it('un 404 trae su código y su mensaje, sin `details`', async () => {
    stubFetch(errorResponse(404, 'not_found', 'La postulación no existe.'));

    const error = await errorOf(getApplication(999));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'La postulación no existe.',
    });
    expect((error as ApiError).details).toBeUndefined();
  });

  it('un 500 de la API conserva su mensaje', async () => {
    stubFetch(errorResponse(500, 'internal_error', 'Ocurrió un error inesperado.'));

    const error = await errorOf(getStats());

    expect(error).toMatchObject({
      status: 500,
      code: 'internal_error',
      message: 'Ocurrió un error inesperado.',
    });
  });

  it.each([502, 503, 504])(
    'un %i con HTML del proxy dice que el servidor no está disponible',
    async (status) => {
      stubFetch(
        new Response('<html><body>Bad Gateway</body></html>', {
          status,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const error = await errorOf(listApplications());

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status,
        code: 'service_unavailable',
        message: SERVICE_UNAVAILABLE_MESSAGE,
      });
      expect((error as ApiError).details).toBeUndefined();
    },
  );

  it('el 503 de /health (sin el formato de errores) también es `service_unavailable`', async () => {
    stubFetch(jsonResponse({ status: 'degraded', database: 'unreachable' }, 503));

    const error = await errorOf(getHealth());

    expect(error).toMatchObject({
      status: 503,
      code: 'service_unavailable',
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
  });

  it.each([
    ['texto plano', 'Not Found'],
    ['JSON null', 'null'],
    ['JSON sin `error`', '{"message":"x"}'],
    ['`error` que no es objeto', '{"error":"x"}'],
    ['`error` null', '{"error":null}'],
    ['sin `code`', '{"error":{"message":"x"}}'],
    ['`code` que no es texto', '{"error":{"code":404,"message":"x"}}'],
    ['sin `message`', '{"error":{"code":"not_found"}}'],
    ['`message` que no es texto', '{"error":{"code":"not_found","message":1}}'],
  ])('un error con %s es `unexpected_response` con mensaje genérico', async (_case, body) => {
    stubFetch(new Response(body, { status: 404 }));

    const error = await errorOf(getApplication(42));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'unexpected_response',
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  });

  it('un 200 que no es JSON (p. ej. index.html) es `unexpected_response`', async () => {
    stubFetch(new Response('<!doctype html><div id="root"></div>', { status: 200 }));

    const error = await errorOf(getStats());

    expect(error).toMatchObject({
      status: 200,
      code: 'unexpected_response',
      message: UNEXPECTED_RESPONSE_MESSAGE,
    });
  });
});

describe('fallas de red y cancelación', () => {
  it('un fallo de red es `network_error`, sin código HTTP y con mensaje en español', async () => {
    const cause = new TypeError('Failed to fetch');
    stubFetch(cause);

    const error = await errorOf(listApplications());

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: undefined,
      code: 'network_error',
      message: NETWORK_ERROR_MESSAGE,
      cause,
    });
    expect(NETWORK_ERROR_MESSAGE).toMatch(/^No se pudo conectar con el servidor/);
  });

  it('cualquier otra cosa que lance fetch también es `network_error`', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue('sin conexión'));

    const error = await errorOf(getStats());

    expect(error).toMatchObject({ status: undefined, code: 'network_error' });
  });

  it('al abortar la señal, el AbortError llega tal cual (no como ApiError)', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const promise = listApplications({ q: 'data' }, controller.signal);
    controller.abort();
    const error = await errorOf(promise);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  it('un AbortError sin señal propia también se propaga tal cual', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    stubFetch(abortError);

    await expect(deleteApplication(42)).rejects.toBe(abortError);
  });

  it('si se aborta mientras se lee el cuerpo, también llega el AbortError', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const response = jsonResponse(makeStats());
    vi.spyOn(response, 'json').mockImplementation(() => {
      controller.abort();
      return Promise.reject(abortError);
    });
    stubFetch(response);

    await expect(getStats(controller.signal)).rejects.toBe(abortError);
  });

  it('si se aborta mientras se lee un error, también llega el AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const response = errorResponse(404, 'not_found', 'La postulación no existe.');
    vi.spyOn(response, 'json').mockRejectedValue(abortError);
    stubFetch(response);

    await expect(getApplication(42)).rejects.toBe(abortError);
  });
});

describe('ApiError con shouldRetry (ADR-012)', () => {
  it.each([
    ['404', () => errorResponse(404, 'not_found', 'La postulación no existe.')],
    ['422', () => errorResponse(422, 'validation_error', 'Algunos campos no son válidos.', {})],
    ['400', () => errorResponse(400, 'bad_request', 'El cuerpo no es JSON válido.')],
  ])('no reintenta un %s', async (_status, response) => {
    stubFetch(response());

    const error = await errorOf(getApplication(42));

    expect(shouldRetry(0, error)).toBe(false);
  });

  it.each([
    ['500 de la API', () => errorResponse(500, 'internal_error', 'Ocurrió un error inesperado.')],
    ['502 del proxy', () => new Response('Bad Gateway', { status: 502 })],
    ['503 de /health', () => jsonResponse({ status: 'degraded', database: 'unreachable' }, 503)],
  ])('reintenta un %s hasta dos veces', async (_case, response) => {
    stubFetch(response());

    const error = await errorOf(getHealth());

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it('reintenta un error de red hasta dos veces', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    const error = await errorOf(getStats());

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });
});
