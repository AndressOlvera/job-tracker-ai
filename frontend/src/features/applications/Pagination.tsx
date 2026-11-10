import { useEffect, useRef } from 'react';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}

/** [Anterior] "Página X de Y" [Siguiente]. No se muestra si hay una sola página. */
export function Pagination({ page, pages, onPageChange }: PaginationProps) {
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const clickedRef = useRef<'previous' | 'next' | null>(null);

  const isFirst = page <= 1;
  const isLast = page >= pages;

  // Al llegar al extremo, el botón que se acaba de pulsar se deshabilita y el foco se perdería:
  // se pasa al otro botón para que el teclado pueda seguir paginando.
  useEffect(() => {
    const clicked = clickedRef.current;
    clickedRef.current = null;
    if (clicked === 'next' && isLast) previousRef.current?.focus();
    if (clicked === 'previous' && isFirst) nextRef.current?.focus();
  }, [page, isFirst, isLast]);

  if (pages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label="Paginación">
      <button
        ref={previousRef}
        type="button"
        className={styles.button}
        disabled={isFirst}
        onClick={() => {
          clickedRef.current = 'previous';
          onPageChange(page - 1);
        }}
      >
        Anterior
      </button>
      <span className={styles.status}>
        Página {page} de {pages}
      </span>
      <button
        ref={nextRef}
        type="button"
        className={styles.button}
        disabled={isLast}
        onClick={() => {
          clickedRef.current = 'next';
          onPageChange(page + 1);
        }}
      >
        Siguiente
      </button>
    </nav>
  );
}
