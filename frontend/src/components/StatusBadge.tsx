import { STATUS_LABELS, type ApplicationStatus } from '../api/status';
import styles from './StatusBadge.module.css';

/** Punto de color de un estado (decorativo: el nombre del estado va siempre al lado). */
export function StatusDot({ status }: { status: ApplicationStatus }) {
  return <span className={`${styles.dot} ${styles[status]}`} aria-hidden="true" />;
}

/** Etiqueta de un estado: punto de color + nombre en español. */
export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
