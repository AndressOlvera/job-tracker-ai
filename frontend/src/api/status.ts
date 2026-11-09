/**
 * Estados de una postulación (docs/01-requisitos.md → Estados de una postulación).
 * Es la única fuente de estos valores en el frontend: la base de datos y la API los repiten, y
 * `status.test.ts` revisa que sigan siendo los mismos (ADR-003).
 * El orden es el del proceso; así se dibujan los filtros, las etiquetas y las gráficas.
 */
export const APPLICATION_STATUSES = ['applied', 'interview', 'offer', 'rejected'] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Etiqueta que ve el usuario para cada estado. */
export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  applied: 'Postulado',
  interview: 'Entrevista',
  offer: 'Oferta',
  rejected: 'Rechazado',
};

/** Para validar lo que llega de fuera, como el `?status=` que alguien escribe en la URL (ADR-013). */
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly unknown[]).includes(value);
}
