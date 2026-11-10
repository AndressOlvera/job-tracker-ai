import { Link, useLocation } from 'react-router';
import type { Application, ApplicationSort, SortField } from '../../api/types';
import { StatusBadge } from '../../components/StatusBadge';
import styles from './ApplicationsTable.module.css';
import { describeSort } from './filters';
import { formatDate, isHttpUrl } from './format';
import { listReturnState } from './listLocation';

interface ApplicationsTableProps {
  items: Application[];
  sort: ApplicationSort;
  onSort: (field: SortField) => void;
  /**
   * Se llama al pulsar ✕ en una fila. La confirmación y la llamada a la API las hace quien lo
   * pasa; mientras no se pase, el botón queda deshabilitado. El ✕ lleva `data-delete-id` para
   * devolverle el foco al cerrar el diálogo.
   */
  onDelete?: (application: Application) => void;
  /** Hay una página nueva en camino: la lista actual se atenúa pero sigue visible. */
  isRefreshing?: boolean;
}

/**
 * Tabla de postulaciones. En celular (<= 640 px) el CSS la convierte en tarjetas apiladas: se
 * conserva el `<table>` semántico y se repiten los roles de tabla explícitos, porque algunos
 * lectores de pantalla la dejan de tratar como tabla cuando el CSS cambia su `display`.
 * Los encabezados que se ordenan se quedan visibles en una fila de botones sobre las tarjetas.
 */
export function ApplicationsTable({
  items,
  sort,
  onSort,
  onDelete,
  isRefreshing = false,
}: ApplicationsTableProps) {
  const location = useLocation();
  // Para volver a la lista con los mismos filtros desde el formulario (ver listLocation.ts).
  const returnState = listReturnState(location);

  return (
    <div
      className={`${styles.wrapper} ${isRefreshing ? styles.refreshing : ''}`}
      aria-busy={isRefreshing}
    >
      <table className={styles.table} role="table">
        <caption className={styles.srOnly}>Postulaciones</caption>
        <thead role="rowgroup">
          <tr role="row">
            <SortHeader field="company" label="Empresa" sort={sort} onSort={onSort} />
            <th scope="col" role="columnheader" className={styles.plainHeader}>
              Puesto
            </th>
            <SortHeader field="status" label="Estado" sort={sort} onSort={onSort} />
            <SortHeader field="applied_on" label="Fecha" sort={sort} onSort={onSort} />
            <th scope="col" role="columnheader" className={styles.plainHeader}>
              Fuente
            </th>
            <th scope="col" role="columnheader" className={styles.plainHeader}>
              <span className={styles.srOnly}>Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((application) => (
            <tr key={application.id} role="row" className={styles.row}>
              <td role="cell" className={styles.company}>
                {application.company}
              </td>
              <td role="cell" data-label="Puesto" className={styles.cell}>
                {application.position}
              </td>
              <td role="cell" data-label="Estado" className={styles.cell}>
                <StatusBadge status={application.status} />
              </td>
              <td role="cell" data-label="Fecha" className={`${styles.cell} ${styles.nowrap}`}>
                {formatDate(application.applied_on)}
              </td>
              <td role="cell" data-label="Fuente" className={styles.cell}>
                {application.source ? (
                  application.source
                ) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className={styles.srOnly}>Sin fuente</span>
                  </>
                )}
              </td>
              <td role="cell" className={styles.actionsCell}>
                <div className={styles.actions}>
                  {application.job_url && isHttpUrl(application.job_url) ? (
                    <a
                      className={styles.action}
                      href={application.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir la vacante de ${application.company} (se abre en una pestaña nueva)`}
                    >
                      <span aria-hidden="true">↗</span>
                    </a>
                  ) : (
                    <span className={styles.actionSlot} aria-hidden="true" />
                  )}
                  <Link
                    className={styles.action}
                    to={`/applications/${application.id}/edit`}
                    state={returnState}
                    aria-label={`Editar la postulación de ${application.company}`}
                  >
                    <span aria-hidden="true">✎</span>
                  </Link>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.danger}`}
                    disabled={!onDelete}
                    data-delete-id={application.id}
                    onClick={() => onDelete?.(application)}
                    aria-label={`Eliminar la postulación de ${application.company}`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SortHeaderProps {
  field: SortField;
  label: string;
  sort: ApplicationSort;
  onSort: (field: SortField) => void;
}

/** Encabezado que ordena: botón dentro del `<th>`, con `aria-sort` y una flecha. */
function SortHeader({ field, label, sort, onSort }: SortHeaderProps) {
  const current = describeSort(sort);
  const isActive = current.field === field;
  const ariaSort = !isActive ? 'none' : current.direction === 'asc' ? 'ascending' : 'descending';
  const arrow = !isActive ? '⇅' : current.direction === 'asc' ? '↑' : '↓';

  return (
    <th scope="col" role="columnheader" aria-sort={ariaSort} className={styles.sortHeader}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(field)}>
        {label}
        <span aria-hidden="true" className={styles.arrow}>
          {arrow}
        </span>
      </button>
    </th>
  );
}
