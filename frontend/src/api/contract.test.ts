/// <reference types="node" />
/**
 * Contrato del cliente contra docs/03-api.md (issue #12).
 *
 * Dos capas de protección:
 * - En tiempo de compilación (`tsc -b`): `expectTypeOf` y `satisfies` con los ejemplos JSON del
 *   spec. Si un tipo cambia sin que cambie el spec (o al revés), el typecheck falla.
 * - En tiempo de ejecución: se lee el propio `docs/03-api.md` (tablas y bloques JSON) y se compara
 *   con los tipos y con lo que hace cada función del cliente. Si alguien edita el spec, falla.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { errorResponse, jsonResponse } from '../test/api';
import {
  ApiError,
  createApplication,
  deleteApplication,
  getApplication,
  getHealth,
  getStats,
  listApplications,
  updateApplication,
} from './client';
import type {
  ApiErrorBody,
  ApiErrorCode,
  Application,
  ApplicationFilters,
  ApplicationInput,
  ApplicationList,
  ApplicationPatch,
  ApplicationSort,
  ApplicationStatus,
  Health,
  MonthCount,
  Paginated,
  Stats,
} from './types';
import { SORT_FIELDS } from './types';
import { APPLICATION_STATUSES } from './status';

// ---------------------------------------------------------------------------------------------
// Lectura del spec
// ---------------------------------------------------------------------------------------------

// Vite no deja importar archivos fuera de `frontend/` (ni con `?raw`), así que se lee con `fs`.
const spec = readFileSync(resolve(process.cwd(), '../docs/03-api.md'), 'utf8');

/** Texto de la sección `## <título>` (hasta el siguiente `## ` o `---`). */
function section(title: string): string {
  const start = spec.indexOf(`\n## ${title}\n`);
  if (start === -1) throw new Error(`docs/03-api.md ya no tiene la sección "${title}".`);
  const rest = spec.slice(start + 1);
  const end = rest.slice(3).search(/\n## |\n---\n/);
  return end === -1 ? rest : rest.slice(0, end + 3);
}

/** Bloques ```json de un texto, ya convertidos con `JSON.parse`. */
function jsonBlocks(text: string): unknown[] {
  return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]!));
}

/** Filas de la primera tabla Markdown del texto, sin encabezado ni acentos graves. */
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll('`', '')),
    );
}

/** Los tipos y el ejemplo del spec tienen que tener exactamente los mismos campos. */
function sortedKeys(value: unknown): string[] {
  return Object.keys(value as object).sort();
}

// ---------------------------------------------------------------------------------------------
// Ejemplos JSON literales del spec (si un tipo no los acepta, falla `tsc`)
// ---------------------------------------------------------------------------------------------

const applicationExample = {
  id: 42,
  company: 'Oracle',
  position: 'Becario de Ingeniería de Software',
  status: 'interview',
  applied_on: '2026-09-28',
  job_url: 'https://www.occ.com.mx/empleo/oferta/12345',
  source: 'OCC',
  notes: 'Entrevista técnica el viernes',
  created_at: '2026-09-28T17:05:11Z',
  updated_at: '2026-10-02T15:40:03Z',
} as const satisfies Application;

const healthOkExample = { status: 'ok', database: 'ok' } as const satisfies Health;
const healthDegradedExample = {
  status: 'degraded',
  database: 'unreachable',
} as const satisfies Health;

const listExample = {
  items: [applicationExample],
  page: 1,
  per_page: 20,
  total: 1,
  pages: 1,
} as const satisfies ApplicationList;

const statsExample = {
  total: 24,
  by_status: { applied: 15, interview: 5, offer: 1, rejected: 3 },
  response_rate: 0.375,
  interview_rate: 0.25,
  by_month: [
    { month: '2026-08', count: 6 },
    { month: '2026-09', count: 18 },
  ],
} as const satisfies Stats;

const errorExample = {
  error: {
    code: 'validation_error',
    message: 'Algunos campos no son válidos.',
    details: {
      company: ['Este campo es obligatorio.'],
      applied_on: ['La fecha no puede ser futura.'],
    },
  },
} as const satisfies ApiErrorBody;

const createExample = {
  company: 'Oracle',
  position: 'Becario de Ingeniería de Software',
  job_url: 'https://www.occ.com.mx/empleo/oferta/12345',
  source: 'OCC',
} as const satisfies ApplicationInput;

const patchExample = { status: 'offer', notes: null } as const satisfies ApplicationPatch;

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

describe('tipos contra docs/03-api.md: forma exacta (se comprueba en `tsc`)', () => {
  it('Application tiene exactamente los campos y tipos del spec', () => {
    expectTypeOf<Application>().toEqualTypeOf<{
      id: number;
      company: string;
      position: string;
      status: 'applied' | 'interview' | 'offer' | 'rejected';
      applied_on: string;
      job_url: string | null;
      source: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>();
  });

  it('Stats, MonthCount y Health tienen la forma del spec', () => {
    expectTypeOf<Stats>().toEqualTypeOf<{
      total: number;
      by_status: { applied: number; interview: number; offer: number; rejected: number };
      response_rate: number;
      interview_rate: number;
      by_month: { month: string; count: number }[];
    }>();
    expectTypeOf<MonthCount>().toEqualTypeOf<{ month: string; count: number }>();
    expectTypeOf<Health>().toEqualTypeOf<{
      status: 'ok' | 'degraded';
      database: 'ok' | 'unreachable';
    }>();
  });

  it('la lista paginada tiene items, page, per_page, total y pages', () => {
    expectTypeOf<Paginated<Application>>().toEqualTypeOf<{
      items: Application[];
      page: number;
      per_page: number;
      total: number;
      pages: number;
    }>();
    expectTypeOf<ApplicationList>().toEqualTypeOf<Paginated<Application>>();
  });

  it('el formato de error tiene code, message y details opcional', () => {
    expectTypeOf<ApiErrorBody>().toEqualTypeOf<{
      error: {
        code: ApiErrorCode;
        message: string;
        details?: Partial<Record<string, string[]>>;
      };
    }>();
  });

  it('los códigos de error son exactamente los seis del spec', () => {
    expectTypeOf<ApiErrorCode>().toEqualTypeOf<
      | 'bad_request'
      | 'not_found'
      | 'method_not_allowed'
      | 'unsupported_media_type'
      | 'validation_error'
      | 'internal_error'
    >();
  });

  it('los filtros son exactamente los siete parámetros del spec, todos opcionales', () => {
    expectTypeOf<keyof ApplicationFilters>().toEqualTypeOf<
      'status' | 'q' | 'applied_from' | 'applied_to' | 'sort' | 'page' | 'per_page'
    >();
    expectTypeOf<Required<ApplicationFilters>['page']>().toEqualTypeOf<number>();
    // `{}` es un filtro válido: todos son opcionales.
    expectTypeOf<Record<never, never>>().toExtend<ApplicationFilters>();
  });

  it('`sort` acepta los 4 campos con o sin `-` (8 valores) y nada más', () => {
    expectTypeOf<ApplicationSort>().toEqualTypeOf<
      | 'applied_on'
      | '-applied_on'
      | 'company'
      | '-company'
      | 'status'
      | '-status'
      | 'created_at'
      | '-created_at'
    >();
  });

  it('los estados son exactamente los cuatro del spec', () => {
    expectTypeOf<ApplicationStatus>().toEqualTypeOf<
      'applied' | 'interview' | 'offer' | 'rejected'
    >();
  });
});

describe('ApplicationInput y ApplicationPatch (se comprueba en `tsc`)', () => {
  /** Llaves obligatorias de un tipo. */
  type RequiredKeys<T> = {
    [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K;
  }[keyof T];

  it('company y position son lo único obligatorio al crear', () => {
    expectTypeOf<RequiredKeys<ApplicationInput>>().toEqualTypeOf<'company' | 'position'>();
    expectTypeOf<keyof ApplicationInput>().toEqualTypeOf<
      'company' | 'position' | 'status' | 'applied_on' | 'job_url' | 'source' | 'notes'
    >();
  });

  it('en el PATCH todo es opcional y tiene los mismos campos que al crear', () => {
    expectTypeOf<RequiredKeys<ApplicationPatch>>().toEqualTypeOf<never>();
    expectTypeOf<keyof ApplicationPatch>().toEqualTypeOf<keyof ApplicationInput>();
  });

  it('en el PATCH solo job_url, source y notes se pueden vaciar con null', () => {
    expectTypeOf<ApplicationPatch['job_url']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ApplicationPatch['source']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ApplicationPatch['notes']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ApplicationPatch['company']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ApplicationPatch['position']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ApplicationPatch['status']>().toEqualTypeOf<ApplicationStatus | undefined>();
    expectTypeOf<ApplicationPatch['applied_on']>().toEqualTypeOf<string | undefined>();
  });

  it('rechaza `id`, `created_at` y `updated_at` al crear (los asigna el servidor)', () => {
    const base = { company: 'Oracle', position: 'Becario' };
    // @ts-expect-error `id` lo asigna el servidor; la API rechaza el cuerpo si lo trae.
    const withId: ApplicationInput = { ...base, id: 1 };
    // @ts-expect-error `created_at` lo asigna el servidor.
    const withCreated: ApplicationInput = { ...base, created_at: '2026-09-28T17:05:11Z' };
    // @ts-expect-error `updated_at` lo asigna el servidor.
    const withUpdated: ApplicationInput = { ...base, updated_at: '2026-09-28T17:05:11Z' };
    expect([withId, withCreated, withUpdated]).toHaveLength(3);
  });

  it('rechaza `id`, `created_at` y `updated_at` en el PATCH', () => {
    // @ts-expect-error `id` no se puede cambiar.
    const withId: ApplicationPatch = { id: 1 };
    // @ts-expect-error `created_at` no se puede cambiar.
    const withCreated: ApplicationPatch = { created_at: '2026-09-28T17:05:11Z' };
    // @ts-expect-error `updated_at` no se puede cambiar.
    const withUpdated: ApplicationPatch = { updated_at: '2026-09-28T17:05:11Z' };
    expect([withId, withCreated, withUpdated]).toHaveLength(3);
  });

  it('exige `company` y `position` al crear', () => {
    // @ts-expect-error falta `position`.
    const noPosition: ApplicationInput = { company: 'Oracle' };
    // @ts-expect-error falta `company`.
    const noCompany: ApplicationInput = { position: 'Becario' };
    // @ts-expect-error faltan los dos.
    const empty: ApplicationInput = {};
    expect([noPosition, noCompany, empty]).toHaveLength(3);
  });

  it('en el input, company y position no aceptan null ni undefined', () => {
    // @ts-expect-error `company` no puede ser null.
    const nullCompany: ApplicationInput = { company: null, position: 'Becario' };
    // @ts-expect-error `position` no puede ser undefined.
    const undefinedPosition: ApplicationInput = { company: 'Oracle', position: undefined };
    expect([nullCompany, undefinedPosition]).toHaveLength(2);
  });

  it('rechaza estados y campos que no existen', () => {
    // @ts-expect-error `hired` no es un estado.
    const badStatus: ApplicationInput = { company: 'A', position: 'B', status: 'hired' };
    // @ts-expect-error `salary` no es un campo del spec ("cualquier campo desconocido").
    const unknown: ApplicationInput = { company: 'A', position: 'B', salary: 1 };
    // @ts-expect-error `status` no se puede vaciar con null en el PATCH.
    const nullStatus: ApplicationPatch = { status: null };
    // @ts-expect-error `company` no se puede vaciar con null en el PATCH (es obligatorio).
    const nullCompany: ApplicationPatch = { company: null };
    // @ts-expect-error la fecha no es nullable (la columna es NOT NULL).
    const nullDate: ApplicationPatch = { applied_on: null };
    expect([badStatus, unknown, nullStatus, nullCompany, nullDate]).toHaveLength(5);
  });

  it('los filtros rechazan valores fuera del spec', () => {
    // @ts-expect-error `hired` no es un estado.
    const badStatus: ApplicationFilters = { status: 'hired' };
    // @ts-expect-error `position` no es un campo de orden válido.
    const badSort: ApplicationFilters = { sort: 'position' };
    // @ts-expect-error `page` es un número, no un texto.
    const badPage: ApplicationFilters = { page: '1' };
    // @ts-expect-error `limit` no existe; el parámetro se llama `per_page`.
    const badName: ApplicationFilters = { limit: 10 };
    expect([badStatus, badSort, badPage, badName]).toHaveLength(4);
  });

  it('las funciones del cliente piden number para el id y rechazan texto', () => {
    expectTypeOf(getApplication).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(updateApplication).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(deleteApplication).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(createApplication).parameter(0).toEqualTypeOf<ApplicationInput>();
    expectTypeOf(updateApplication).parameter(1).toEqualTypeOf<ApplicationPatch>();
    expectTypeOf(createApplication).returns.resolves.toEqualTypeOf<Application>();
    expectTypeOf(updateApplication).returns.resolves.toEqualTypeOf<Application>();
    expectTypeOf(getApplication).returns.resolves.toEqualTypeOf<Application>();
    expectTypeOf(deleteApplication).returns.resolves.toEqualTypeOf<void>();
    expectTypeOf(listApplications).returns.resolves.toEqualTypeOf<ApplicationList>();
    expectTypeOf(getStats).returns.resolves.toEqualTypeOf<Stats>();
    expectTypeOf(getHealth).returns.resolves.toEqualTypeOf<Health>();
  });

  // Limitación de TypeScript (no del código): el control de campos sobrantes solo aplica a objetos
  // literales. Una variable con campos de más pasa; la API la rechazaría con 422.
  it('LIMITACIÓN: un objeto que no es literal con campos de más sí compila', () => {
    const full: Application = { ...applicationExample };
    expectTypeOf(full).toExtend<ApplicationPatch>();
    const withExtras = { ...createExample, id: 1 };
    expectTypeOf(withExtras).toExtend<ApplicationInput>();
  });
});

// ---------------------------------------------------------------------------------------------
// Ejemplos y tablas del spec contra tipos y cliente
// ---------------------------------------------------------------------------------------------

describe('ejemplos JSON del spec', () => {
  it('Application: el ejemplo del spec es idéntico al literal tipado', () => {
    expect(jsonBlocks(section('Objeto `Application`'))[0]).toEqual(applicationExample);
  });

  it('Application: mismas llaves que el spec (si falta o sobra una, falla)', () => {
    const keys = sortedKeys(applicationExample);
    expect(sortedKeys(jsonBlocks(section('Objeto `Application`'))[0])).toEqual(keys);
    // Y el tipo tiene esas mismas llaves (el literal del ejemplo ya es idéntico al spec).
    expectTypeOf<keyof typeof applicationExample>().toEqualTypeOf<keyof Application>();
  });

  it('Health: los dos ejemplos (200 y 503) del spec', () => {
    const [ok, degraded] = jsonBlocks(section('`GET /api/v1/health`'));
    expect(ok).toEqual(healthOkExample);
    expect(degraded).toEqual(healthDegradedExample);
  });

  it('lista paginada: el spec trae exactamente items, page, per_page, total y pages', () => {
    const [example] = jsonBlocks(section('`GET /api/v1/applications`'));
    expect(sortedKeys(example)).toEqual(sortedKeys(listExample));
    expect(example).toMatchObject({ page: 1, per_page: 20, total: 1, pages: 1 });
  });

  it('Stats: el ejemplo del spec es idéntico al literal tipado', () => {
    expect(jsonBlocks(section('`GET /api/v1/stats`'))[0]).toEqual(statsExample);
  });

  it('error: el ejemplo del spec es idéntico al literal tipado', () => {
    expect(jsonBlocks(section('Errores'))[0]).toEqual(errorExample);
  });

  it('POST y PATCH: los ejemplos del spec son idénticos a los literales tipados', () => {
    expect(jsonBlocks(section('`POST /api/v1/applications`'))[0]).toEqual(createExample);
    expect(jsonBlocks(section('`PATCH /api/v1/applications/{id}`'))[0]).toEqual(patchExample);
  });
});

describe('tablas del spec contra los tipos', () => {
  it('estados: los cuatro de la tabla del POST son los de APPLICATION_STATUSES', () => {
    const statusRow = tableRows(section('`POST /api/v1/applications`')).find(
      ([field]) => field === 'status',
    );
    const documented = [...(statusRow?.[2] ?? '').matchAll(/(\w+)/g)].map((m) => m[1]);
    for (const status of APPLICATION_STATUSES) expect(documented).toContain(status);
  });

  it('parámetros de consulta: los mismos nombres que ApplicationFilters', () => {
    const documented = tableRows(section('`GET /api/v1/applications`')).map(([name]) => name);
    expect(documented.sort()).toEqual(
      ['status', 'q', 'applied_from', 'applied_to', 'sort', 'page', 'per_page'].sort(),
    );
  });

  it('`sort`: los valores documentados son los de SORT_FIELDS', () => {
    const row = tableRows(section('`GET /api/v1/applications`')).find(([name]) => name === 'sort');
    const listed = /Valores: (.*)$/.exec(row?.[2] ?? '')?.[1]?.split(', ');
    expect(listed).toEqual([...SORT_FIELDS]);
  });

  it('cuerpo del POST: mismos campos que ApplicationInput y mismos obligatorios', () => {
    const rows = tableRows(section('`POST /api/v1/applications`'));
    expect(rows.map(([field]) => field).sort()).toEqual(
      ['company', 'position', 'status', 'applied_on', 'job_url', 'source', 'notes'].sort(),
    );
    const required = rows.filter(([, mandatory]) => mandatory === 'Sí').map(([field]) => field);
    expect(required).toEqual(['company', 'position']);
  });

  it('códigos de error: los de la tabla son los de ApiErrorCode', () => {
    const rows = tableRows(section('Errores')).filter(([, code]) => code !== '—');
    expect(rows.map(([, code]) => code).sort()).toEqual(
      [
        'bad_request',
        'not_found',
        'method_not_allowed',
        'unsupported_media_type',
        'validation_error',
        'internal_error',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Cada endpoint de la tabla del spec: método, ruta y código de éxito
// ---------------------------------------------------------------------------------------------

function stubFetch(response: () => Response) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response()));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface EndpointCase {
  run: () => Promise<unknown>;
  body: () => Response;
}

/** Una entrada por endpoint, con la respuesta de éxito que documenta el spec. */
const ENDPOINTS: Record<string, EndpointCase> = {
  'GET /api/v1/health': { run: () => getHealth(), body: () => jsonResponse(healthOkExample) },
  'GET /api/v1/applications': {
    run: () => listApplications(),
    body: () => jsonResponse(listExample),
  },
  'POST /api/v1/applications': {
    run: () => createApplication(createExample),
    body: () => jsonResponse(applicationExample, 201),
  },
  'GET /api/v1/applications/{id}': {
    run: () => getApplication(42),
    body: () => jsonResponse(applicationExample),
  },
  'PATCH /api/v1/applications/{id}': {
    run: () => updateApplication(42, patchExample),
    body: () => jsonResponse(applicationExample),
  },
  'DELETE /api/v1/applications/{id}': {
    run: () => deleteApplication(42),
    body: () => new Response(null, { status: 204 }),
  },
  'GET /api/v1/stats': { run: () => getStats(), body: () => jsonResponse(statsExample) },
};

describe('los 7 endpoints del spec tienen su función en el cliente', () => {
  const documented = tableRows(section('Resumen de endpoints')).map(
    ([method, path, , success]) => ({ key: `${method} ${path}`, method, path, success }),
  );

  it('el spec lista exactamente los 7 endpoints que cubre el cliente', () => {
    expect(documented.map(({ key }) => key).sort()).toEqual(Object.keys(ENDPOINTS).sort());
  });

  it.each(documented)(
    '$key ($success): método, URL y éxito',
    async ({ key, method, path, success }) => {
      const endpoint = ENDPOINTS[key];
      expect(endpoint).toBeDefined();
      const fetchMock = stubFetch(endpoint!.body);

      await expect(endpoint!.run()).resolves.not.toThrow();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe(path!.replace('{id}', '42'));
      expect(init?.method).toBe(method);
      // El código de éxito documentado es el que simula la respuesta de la prueba.
      expect(endpoint!.body().status).toBe(Number(success));
    },
  );
});

describe('respuestas del spec a través del cliente', () => {
  it('devuelve cada ejemplo del spec sin alterarlo', async () => {
    for (const [key, expected] of [
      ['GET /api/v1/health', healthOkExample],
      ['GET /api/v1/applications', listExample],
      ['POST /api/v1/applications', applicationExample],
      ['GET /api/v1/applications/{id}', applicationExample],
      ['PATCH /api/v1/applications/{id}', applicationExample],
      ['GET /api/v1/stats', statsExample],
    ] as const) {
      stubFetch(ENDPOINTS[key]!.body);
      await expect(ENDPOINTS[key]!.run()).resolves.toEqual(expected);
    }
  });

  it('el error de validación del spec llega como ApiError con sus details', async () => {
    stubFetch(() => jsonResponse(errorExample, 422));

    const error = await createApplication(createExample).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'Algunos campos no son válidos.',
      details: errorExample.error.details,
    });
  });

  // Cada fila `HTTP | code` de la tabla de errores se convierte en un ApiError con ese par.
  const errorRows = tableRows(section('Errores')).filter(([, code]) => code !== '—');
  it.each(errorRows)('%s %s llega como ApiError con ese status y código', async (status, code) => {
    stubFetch(() => errorResponse(Number(status), code!, 'Mensaje de prueba.'));

    const error = await getStats().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: Number(status), code, message: 'Mensaje de prueba.' });
  });
});

// ---------------------------------------------------------------------------------------------
// Diferencias con el spec (comportamiento actual, ver informe)
// ---------------------------------------------------------------------------------------------

describe('Health: el 503 del spec', () => {
  // docs/03-api.md: `503` con `{ "status": "degraded", "database": "unreachable" }`.
  // El tipo `Health` admite 'degraded', pero `getHealth` rechaza en un 503 y descarta ese cuerpo,
  // así que ningún llamador puede leerlo. Esta prueba fija el comportamiento actual.
  it('CARACTERIZACIÓN: getHealth rechaza con service_unavailable y pierde el cuerpo degraded', async () => {
    stubFetch(() => jsonResponse(healthDegradedExample, 503));

    const error = await getHealth().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'service_unavailable' });
    expect(JSON.stringify(error)).not.toContain('unreachable');
  });
});
