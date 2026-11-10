import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '../../api/status';
import type { Stats } from '../../api/types';
import { StatusDot } from '../../components/StatusBadge';
import { formatNumber } from './format';
import styles from './StatusFilter.module.css';

interface StatusFilterProps {
  /** Estado activo; `undefined` es "Todas". */
  value: ApplicationStatus | undefined;
  onChange: (status: ApplicationStatus | undefined) => void;
  /** Conteos de toda la cuenta (`/stats`), no de la página. Sin ellos no se muestra ningún número. */
  stats: Stats | undefined;
}

/**
 * Franja proporcional por estado y fila de botones que filtran por estado (docs/04-pantallas.md).
 * Son botones con `aria-pressed` (un conmutador por opción) y no enlaces: cambian un filtro de la
 * pantalla, no llevan a otra página.
 */
export function StatusFilter({ value, onChange, stats }: StatusFilterProps) {
  return (
    <div>
      {stats && stats.total > 0 && (
        <div className={styles.strip} aria-hidden="true">
          {APPLICATION_STATUSES.filter((status) => stats.by_status[status] > 0).map((status) => (
            <span
              key={status}
              className={styles.segment}
              data-status={status}
              style={{ flexGrow: stats.by_status[status] }}
            />
          ))}
        </div>
      )}
      <div className={styles.group} role="group" aria-label="Filtrar por estado">
        <button
          type="button"
          className={styles.button}
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          Todas {stats && <span className={styles.count}>{formatNumber(stats.total)}</span>}
        </button>
        {APPLICATION_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={styles.button}
            aria-pressed={value === status}
            onClick={() => onChange(status)}
          >
            <StatusDot status={status} />
            {STATUS_LABELS[status]}{' '}
            {stats && <span className={styles.count}>{formatNumber(stats.by_status[status])}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
