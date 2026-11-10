import type { ReactNode, Ref } from 'react';
import styles from './StateMessage.module.css';

interface StateMessageProps {
  title: string;
  children?: ReactNode;
  /** Los botones o enlaces de la salida (Reintentar, Limpiar filtros...). */
  actions?: ReactNode;
  /** `alert` para errores: el lector de pantalla los anuncia al aparecer. */
  role?: 'alert';
  /** Para poder mover el foco al mensaje (queda enfocable por programa, no con Tab). */
  ref?: Ref<HTMLDivElement>;
}

/** Mensaje centrado para los estados especiales de la lista: vacío, sin resultados y error. */
export function StateMessage({ title, children, actions, role, ref }: StateMessageProps) {
  return (
    <div className={styles.message} role={role} ref={ref} tabIndex={ref ? -1 : undefined}>
      <h2 className={styles.title}>{title}</h2>
      {children && <p className={styles.text}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
