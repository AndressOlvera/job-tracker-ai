import type { FormField } from './validation';

/** `id` del control de cada campo; el foco al primer error lo busca por aquí. */
export function fieldId(field: FormField): string {
  return `application-${field}`;
}
