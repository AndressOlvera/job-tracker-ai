import styles from './TableSkeleton.module.css';

const ROWS = 6;

/** Esqueleto de la tabla para la primera carga. Los bloques grises son solo decoración. */
export function TableSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className={styles.srOnly}>
        Cargando postulaciones…
      </p>
      <div className={styles.table} aria-hidden="true">
        {Array.from({ length: ROWS }, (_, index) => (
          <div key={index} className={styles.row}>
            <span className={`${styles.bar} ${styles.company}`} />
            <span className={`${styles.bar} ${styles.position}`} />
            <span className={`${styles.bar} ${styles.status}`} />
            <span className={`${styles.bar} ${styles.date}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
