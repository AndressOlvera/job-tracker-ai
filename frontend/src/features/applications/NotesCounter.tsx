import styles from './NotesCounter.module.css';
import { countCharacters, MAX_LENGTH } from './validation';

export const NOTES_COUNTER_ID = 'application-notes-count';

/** A partir de aquí (90 %) se avisa a los lectores de pantalla que se acerca el límite. */
const WARN_AT = Math.floor(MAX_LENGTH.notes * 0.9);

function liveMessage(count: number): string {
  if (count > MAX_LENGTH.notes) return `Superaste el límite de ${MAX_LENGTH.notes} caracteres.`;
  if (count >= WARN_AT) return `Te acercas al límite de ${MAX_LENGTH.notes} caracteres.`;
  return '';
}

/**
 * "0 de 5000 caracteres". El número se actualiza en cada tecla pero no se anuncia (sería
 * ruidoso); la región `aria-live` solo habla al acercarse al límite y al pasarse, porque su texto
 * cambia únicamente en esos dos momentos.
 */
export function NotesCounter({ text }: { text: string }) {
  const count = countCharacters(text);
  const over = count > MAX_LENGTH.notes;
  return (
    <>
      <p
        id={NOTES_COUNTER_ID}
        className={over ? `${styles.counter} ${styles.over}` : styles.counter}
      >
        {count} de {MAX_LENGTH.notes} caracteres
      </p>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {liveMessage(count)}
      </p>
    </>
  );
}
