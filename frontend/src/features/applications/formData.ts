/**
 * Del formulario a la API y de vuelta: valores iniciales, cuerpos de POST y PATCH, y errores `422`.
 * Son funciones puras; la pantalla solo las conecta con el estado y la red.
 */
import { isApplicationStatus } from '../../api/status';
import type {
  Application,
  ApplicationInput,
  ApplicationPatch,
  ValidationDetails,
} from '../../api/types';
import { isFormField, type FormErrors, type FormField, type FormValues } from './validation';

/** Formulario vacío para una postulación nueva: estado Postulado y la fecha de hoy. */
export function emptyValues(today: string): FormValues {
  return {
    company: '',
    position: '',
    status: 'applied',
    applied_on: today,
    job_url: '',
    source: '',
    notes: '',
  };
}

/** Llena el formulario con una postulación: lo que viene `null` queda como campo vacío. */
export function valuesFromApplication(application: Application): FormValues {
  return {
    company: application.company,
    position: application.position,
    status: application.status,
    applied_on: application.applied_on,
    job_url: application.job_url ?? '',
    source: application.source ?? '',
    notes: application.notes ?? '',
  };
}

/** Texto recortado; vacío o solo espacios es `null` (la API lo guarda como `null`). */
function optional(value: string): string | null {
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Cuerpo de `POST`. Los opcionales vacíos se omiten: la API los guarda como `null`.
 * Los valores ya pasaron `validateForm`; si el estado no fuera válido se omite y la API usa su
 * valor por defecto.
 */
export function buildCreateInput(values: FormValues): ApplicationInput {
  const input: ApplicationInput = {
    company: values.company.trim(),
    position: values.position.trim(),
    applied_on: values.applied_on.trim(),
  };
  if (isApplicationStatus(values.status)) input.status = values.status;
  const jobUrl = optional(values.job_url);
  const source = optional(values.source);
  const notes = optional(values.notes);
  if (jobUrl !== null) input.job_url = jobUrl;
  if (source !== null) input.source = source;
  if (notes !== null) input.notes = notes;
  return input;
}

/** Campos cuyo valor escrito es distinto del que tiene la postulación guardada. */
export function changedFields(values: FormValues, original: Application): FormField[] {
  const changed: FormField[] = [];
  if (values.company.trim() !== original.company) changed.push('company');
  if (values.position.trim() !== original.position) changed.push('position');
  if (values.status !== original.status) changed.push('status');
  if (values.applied_on.trim() !== original.applied_on) changed.push('applied_on');
  if (optional(values.job_url) !== (original.job_url ?? null)) changed.push('job_url');
  if (optional(values.source) !== (original.source ?? null)) changed.push('source');
  if (optional(values.notes) !== (original.notes ?? null)) changed.push('notes');
  return changed;
}

/**
 * Cuerpo de `PATCH`: solo lo que cambió. Un opcional que se vació va como `null` (así se puede
 * vaciar, HU-04). Devuelve `{}` si no cambió nada: la API respondería `422` a un cuerpo vacío,
 * así que quien lo llama no debe hacer la petición.
 */
export function buildPatch(values: FormValues, original: Application): ApplicationPatch {
  const patch: ApplicationPatch = {};
  for (const field of changedFields(values, original)) {
    switch (field) {
      case 'company':
      case 'position':
      case 'applied_on':
        patch[field] = values[field].trim();
        break;
      case 'status':
        if (isApplicationStatus(values.status)) patch.status = values.status;
        break;
      case 'job_url':
      case 'source':
      case 'notes':
        patch[field] = optional(values[field]);
        break;
    }
  }
  return patch;
}

export interface MappedApiErrors {
  /** Mensaje de la API para cada campo del formulario, tal cual. */
  fields: FormErrors;
  /** Lo que no pertenece a un campo: errores de todo el cuerpo (`body`) y llaves desconocidas. */
  general: string[];
}

/**
 * Mensajes de un valor de `details`. La API manda listas de texto, pero esto viene de la red: un
 * texto suelto cuenta como un solo mensaje y cualquier otra forma (número, objeto, lista sin
 * texto) es `null`, para que quien llama use el mensaje general en lugar de romperse.
 */
function toMessages(value: unknown): string[] | null {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value];
  if (!Array.isArray(value)) return null;
  const texts = value.filter((item): item is string => typeof item === 'string' && item !== '');
  return texts.length === 0 && value.length > 0 ? null : texts;
}

/**
 * Reparte los `details` de un `422` entre los campos del formulario (las llaves son los nombres
 * de campo de la API) y el aviso general. Si la API no dio detalles, o dio algo que no se puede
 * leer, el aviso es su mensaje.
 */
export function mapApiErrors(
  details: ValidationDetails | undefined,
  fallbackMessage: string,
): MappedApiErrors {
  const fields: FormErrors = {};
  const general: string[] = [];
  const entries = typeof details === 'object' && details !== null ? Object.entries(details) : [];
  let unreadable = false;
  for (const [key, value] of entries) {
    const messages = toMessages(value);
    if (messages === null) unreadable = true;
    else if (messages.length === 0) continue;
    else if (isFormField(key)) fields[key] = messages.join(' ');
    else general.push(...messages);
  }
  if (unreadable || (Object.keys(fields).length === 0 && general.length === 0)) {
    general.push(fallbackMessage);
  }
  return { fields, general };
}
