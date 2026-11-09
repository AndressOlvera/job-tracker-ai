import type { Application, ApplicationList, Stats } from '../api/types';

/**
 * Datos y respuestas de ejemplo para simular la API en las pruebas (con `vi.stubGlobal('fetch')`).
 * Siguen los ejemplos de docs/03-api.md.
 */

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
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
    ...overrides,
  };
}

/** Una página de resultados con `items`; el resto se calcula como lo haría la API. */
export function makeApplicationList(
  items: Application[] = [makeApplication()],
  overrides: Partial<ApplicationList> = {},
): ApplicationList {
  const perPage = overrides.per_page ?? 20;
  const total = overrides.total ?? items.length;
  return {
    items,
    page: 1,
    per_page: perPage,
    total,
    pages: Math.ceil(total / perPage),
    ...overrides,
  };
}

export function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    total: 24,
    by_status: { applied: 15, interview: 5, offer: 1, rejected: 3 },
    response_rate: 0.375,
    interview_rate: 0.25,
    by_month: [
      { month: '2026-08', count: 6 },
      { month: '2026-09', count: 18 },
    ],
    ...overrides,
  };
}

/** Respuesta JSON como las de la API. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Respuesta de error con el formato de docs/03-api.md → Errores. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[]>,
): Response {
  return jsonResponse({ error: { code, message, ...(details && { details }) } }, status);
}
