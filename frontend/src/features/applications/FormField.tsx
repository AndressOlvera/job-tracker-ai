import type { ReactNode } from 'react';
import { fieldId } from './fieldId';
import styles from './FormField.module.css';
import type { FormField as FieldName } from './validation';

/** Lo que el control (input, select, textarea) debe recibir para quedar bien enlazado. */
export interface ControlProps {
  id: string;
  className: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FormFieldProps {
  field: FieldName;
  label: string;
  required?: boolean;
  /** Ayuda corta bajo el campo ("Dónde encontraste la vacante."). */
  hint?: string;
  error?: string;
  /** `id`s de otros elementos que describen el control (como el contador de las notas). */
  describedBy?: string[];
  /** Ocupa las dos columnas en pantallas grandes. */
  wide?: boolean;
  children: (control: ControlProps) => ReactNode;
}

/**
 * Etiqueta, control, ayuda y error de un campo, enlazados para lectores de pantalla:
 * `<label for>`, `aria-describedby` con la ayuda y el error, y `aria-invalid` si hay error.
 */
export function FormField({
  field,
  label,
  required,
  hint,
  error,
  describedBy = [],
  wide,
  children,
}: FormFieldProps) {
  const id = fieldId(field);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const ids = [...(hint ? [hintId] : []), ...describedBy, ...(error ? [errorId] : [])];

  return (
    <div className={wide ? `${styles.field} ${styles.wide}` : styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {/* El asterisco es decoración: el atributo `required` del control ya dice "obligatorio". */}
        {required && (
          <span className={styles.asterisk} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children({
        id,
        className: error ? `${styles.control} ${styles.invalid}` : styles.control,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}
