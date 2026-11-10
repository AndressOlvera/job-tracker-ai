import { useEffect, useRef, type ChangeEvent } from 'react';
import { MAX_QUERY_LENGTH, normalizeQuery } from './filters';
import styles from './SearchBox.module.css';

/** Id del campo, para devolverle el foco desde fuera (p. ej. tras "Limpiar filtros"). */
export const SEARCH_INPUT_ID = 'applications-search';

/** Espera después de la última tecla antes de aplicar la búsqueda (ADR-013). */
export const SEARCH_DEBOUNCE_MS = 300;

interface SearchBoxProps {
  /** La búsqueda que dice la URL. */
  value: string;
  /** Se llama con el texto ya normalizado (`''` = sin búsqueda). */
  onSearch: (query: string) => void;
}

/**
 * Campo de búsqueda con debounce. Es un campo no controlado a propósito: mientras el usuario
 * escribe, la URL cambia y la lista se vuelve a pintar, pero el campo no se toca, así no se
 * pierde ni el texto ni el foco. Solo se reescribe cuando la URL cambia por otro lado (atrás,
 * adelante, "Limpiar filtros").
 */
export function SearchBox({ value, onSearch }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // Lo último que este campo aplicó (o leyó de la URL): distingue un cambio propio de uno externo.
  const appliedRef = useRef(value);
  // El temporizador usa siempre la versión más reciente del callback.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    if (value === appliedRef.current) return;
    appliedRef.current = value;
    window.clearTimeout(timerRef.current);
    if (inputRef.current) inputRef.current.value = value;
  }, [value]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.currentTarget.value;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const query = normalizeQuery(text);
      if (query === appliedRef.current) return;
      appliedRef.current = query;
      onSearchRef.current(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className={styles.field}>
      <label htmlFor={SEARCH_INPUT_ID} className={styles.label}>
        Buscar
      </label>
      <input
        ref={inputRef}
        id={SEARCH_INPUT_ID}
        type="search"
        className={styles.input}
        defaultValue={value}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Empresa o puesto"
        autoComplete="off"
        onChange={handleChange}
      />
    </div>
  );
}
