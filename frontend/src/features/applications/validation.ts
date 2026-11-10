/**
 * Validación del formulario de postulaciones: las mismas reglas y los mismos mensajes que la API
 * (docs/03-api.md → POST), en funciones puras para poder probarlas sin pantalla.
 * La API vuelve a validar todo; esto solo evita el viaje y da el error junto al campo.
 */
import { isApplicationStatus } from '../../api/status';
import { isHttpUrl } from './format';

/** Campos del formulario, en el orden en que se ven (el foco va al primero con error). */
export const FORM_FIELDS = [
  'company',
  'position',
  'status',
  'applied_on',
  'job_url',
  'source',
  'notes',
] as const;

export type FormField = (typeof FORM_FIELDS)[number];

/** Lo que hay escrito en los campos. Todo es texto, como en el DOM. */
export type FormValues = Record<FormField, string>;

/** Un mensaje por campo con error. */
export type FormErrors = Partial<Record<FormField, string>>;

export function isFormField(value: string): value is FormField {
  return (FORM_FIELDS as readonly string[]).includes(value);
}

/** Máximos de la API, en caracteres. */
export const MAX_LENGTH = {
  company: 120,
  position: 120,
  job_url: 500,
  source: 60,
  notes: 5000,
} as const;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
export const FUTURE_DATE_MESSAGE = 'La fecha no puede ser futura.';
export const INVALID_DATE_MESSAGE = 'Escribe una fecha válida.';
export const INVALID_STATUS_MESSAGE = 'Elige un estado válido.';
export const INVALID_URL_MESSAGE = 'Escribe una URL válida que empiece con http:// o https://.';

export function maxLengthMessage(max: number): string {
  return `Máximo ${max} caracteres.`;
}

/**
 * Caracteres de un texto. Se cuentan puntos de código y no unidades UTF-16 (`string.length`)
 * para coincidir con la API, que cuenta caracteres: un emoji vale 1, no 2.
 */
export function countCharacters(text: string): number {
  return [...text].length;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** `AAAA-MM-DD` que existe en el calendario (`2026-02-31` no). Sin pasar por `Date` (ADR-009). */
export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function validateRequiredText(value: string, max: number): string | undefined {
  const text = value.trim();
  if (text === '') return REQUIRED_MESSAGE;
  if (countCharacters(text) > max) return maxLengthMessage(max);
  return undefined;
}

function validateOptionalText(value: string, max: number): string | undefined {
  return countCharacters(value.trim()) > max ? maxLengthMessage(max) : undefined;
}

function validateUrl(value: string): string | undefined {
  const url = value.trim();
  if (url === '') return undefined;
  if (countCharacters(url) > MAX_LENGTH.job_url) return maxLengthMessage(MAX_LENGTH.job_url);
  // El prefijo se revisa aparte: `new URL('http:ejemplo')` también es válida para el navegador.
  const looksLikeHttp = /^https?:\/\/\S+$/i.test(url);
  return looksLikeHttp && isHttpUrl(url) ? undefined : INVALID_URL_MESSAGE;
}

function validateDate(value: string, today: string): string | undefined {
  const date = value.trim();
  if (date === '') return REQUIRED_MESSAGE;
  if (!isRealDate(date)) return INVALID_DATE_MESSAGE;
  // `AAAA-MM-DD` se ordena igual como texto que como fecha.
  return date > today ? FUTURE_DATE_MESSAGE : undefined;
}

/** Mensaje de error de un campo, o `undefined` si el valor es válido. `today` es `AAAA-MM-DD`. */
export function validateField(field: FormField, value: string, today: string): string | undefined {
  switch (field) {
    case 'company':
    case 'position':
      return validateRequiredText(value, MAX_LENGTH[field]);
    case 'status':
      return isApplicationStatus(value) ? undefined : INVALID_STATUS_MESSAGE;
    case 'applied_on':
      return validateDate(value, today);
    case 'job_url':
      return validateUrl(value);
    case 'source':
    case 'notes':
      return validateOptionalText(value, MAX_LENGTH[field]);
  }
}

/** Errores de los campos indicados (todos por defecto). Sin errores devuelve `{}`. */
export function validateForm(
  values: FormValues,
  today: string,
  fields: readonly FormField[] = FORM_FIELDS,
): FormErrors {
  const errors: FormErrors = {};
  for (const field of fields) {
    const message = validateField(field, values[field], today);
    if (message) errors[field] = message;
  }
  return errors;
}

/** El primer campo con error, en el orden visual del formulario. */
export function firstInvalidField(errors: FormErrors): FormField | undefined {
  return FORM_FIELDS.find((field) => errors[field] !== undefined);
}
