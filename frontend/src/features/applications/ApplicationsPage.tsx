import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router';
import { useApplications, useDeleteApplication, useStats } from '../../api/queries';
import type { Application, SortField } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/toastContext';
import { ApplicationsTable } from './ApplicationsTable';
import styles from './ApplicationsPage.module.css';
import {
  changeFilters,
  clearFilters,
  hasActiveFilters,
  nextSort,
  parseListSearch,
  toApiFilters,
  toSearchParams,
  type ListFilters,
} from './filters';
import { formatNumber } from './format';
import { listReturnState } from './listLocation';
import buttons from './listButtons.module.css';
import { Pagination } from './Pagination';
import { SEARCH_INPUT_ID, SearchBox } from './SearchBox';
import { StateMessage } from './StateMessage';
import { StatusFilter } from './StatusFilter';
import { TableSkeleton } from './TableSkeleton';

/** Lo que el diálogo de eliminar necesita saber de la fila elegida. */
interface PendingDelete {
  /** La postulación tal como se veía al pulsar ✕: el texto del diálogo no cambia si la lista se refresca. */
  application: Application;
  /** Era la única fila de una página que no es la primera: al borrarla hay que retroceder. */
  lastOnPage: boolean;
}

interface DeleteFailure {
  message: string;
  /** 404: ya no existe, no tiene caso reintentar. */
  gone: boolean;
}

/** Lo que se lee de un `ApiError` (no se importa la clase: ADR-012). */
interface DeleteError {
  status: number | undefined;
  message: string;
}

export const GONE_MESSAGE = 'Esta postulación ya no existe.';

/** El ✕ de una fila. Se busca en el DOM porque la fila pudo cambiar mientras estaba el diálogo. */
function findDeleteButton(id: number) {
  return document.querySelector<HTMLElement>(`[data-delete-id="${id}"]`);
}

/** Lista de postulaciones (`/`, docs/04-pantallas.md). Los filtros viven en la URL (ADR-013). */
export function ApplicationsPage() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseListSearch(searchParams), [searchParams]);
  const resultsRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // ¿La renderización anterior mostraba una lista? Si sí y ahora hay un error sin datos, la tabla
  // (con el botón que tenía el foco: encabezado de orden, "Siguiente") acaba de desaparecer.
  const hadListRef = useRef(false);

  const applications = useApplications(toApiFilters(filters));
  // Los conteos de los botones y "N registradas en total" salen de /stats (toda la cuenta), no de
  // la página que se ve. Si /stats falla o aún carga, esos números simplemente no se muestran.
  const stats = useStats();

  const { data, isError, isPlaceholderData, error, refetch } = applications;

  const toast = useToast();
  const deleteMutation = useDeleteApplication();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteFailure, setDeleteFailure] = useState<DeleteFailure | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  // Guardia síncrona: dos eventos pueden llegar antes de que React deshabilite el botón.
  const deletingRef = useRef(false);
  // A dónde va el foco al cerrar el diálogo: al ✕ de esa postulación o, si ya no está, al título.
  const focusAfterCloseRef = useRef<number | 'heading' | null>(null);
  const showErrorPanel = !data && isError;
  const filtered = hasActiveFilters(filters);
  const listState = listReturnState(location);

  // Si el foco se perdió porque la lista se reemplazó por el error, pasa al aviso para que el
  // teclado no tenga que volver a empezar desde el inicio de la página.
  useEffect(() => {
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (showErrorPanel && hadListRef.current && focusLost) errorRef.current?.focus();
    hadListRef.current = Boolean(data);
  }, [showErrorPanel, data]);

  // El diálogo ya se desmontó y la página volvió a ser accesible (`inert`): ahora sí se puede
  // enfocar. Se intenta el ✕ de la fila; si ya no existe (se borró), el título, para que el foco
  // no caiga en <body>. Va en un efecto porque corre después de que el diálogo limpia su `inert`.
  useEffect(() => {
    if (pendingDelete) return;
    const target = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (target === null) return;
    const button = target === 'heading' ? null : findDeleteButton(target);
    (button ?? headingRef.current)?.focus();
  }, [pendingDelete]);

  // El aviso va aquí y no junto al cierre del diálogo: mientras está abierto el fondo es `inert`,
  // y un cambio en la región `role="status"` en ese momento no se anunciaría.
  useEffect(() => {
    if (deletedCount > 0) toast.show('Postulación eliminada');
  }, [deletedCount, toast]);

  function requestDelete(application: Application) {
    const lastOnPage = data !== undefined && data.items.length === 1 && filters.page > 1;
    // Si ya hay un diálogo abierto no se abre otro encima.
    setPendingDelete((current) => current ?? { application, lastOnPage });
    setDeleteFailure(null);
  }

  function cancelDelete() {
    if (!pendingDelete || deletingRef.current) return;
    focusAfterCloseRef.current = pendingDelete.application.id;
    // Tras un 404 la lista ya se actualizó detrás del diálogo: si la fila era la última de la
    // última página, esa página quedó vacía y también hay que retroceder.
    if (deleteFailure?.gone && pendingDelete.lastOnPage) {
      update({ page: filters.page - 1 }, { replace: true });
    }
    setPendingDelete(null);
    setDeleteFailure(null);
  }

  function confirmDelete() {
    if (!pendingDelete || deletingRef.current) return;
    deletingRef.current = true;
    setDeleteFailure(null);
    const { application, lastOnPage } = pendingDelete;
    deleteMutation.mutate(application.id, {
      onSuccess: () => {
        deletingRef.current = false;
        // La fila ya no existe: el foco va al título, no al ✕.
        focusAfterCloseRef.current = 'heading';
        setPendingDelete(null);
        setDeletedCount((count) => count + 1);
        // Era lo último de la última página: se vuelve a la anterior en vez de mostrar
        // "Esta página no existe". `replace` para que "atrás" no regrese a esa página vacía.
        if (lastOnPage) update({ page: filters.page - 1 }, { replace: true });
      },
      onError: (failure: DeleteError) => {
        deletingRef.current = false;
        const gone = failure.status === 404;
        setDeleteFailure({ message: gone ? GONE_MESSAGE : failure.message, gone });
      },
    });
  }

  /** Escribe los filtros nuevos en la URL. Sin cambio real no se navega (no ensucia el historial). */
  function navigateTo(next: ListFilters, { replace = false } = {}) {
    const params = toSearchParams(next);
    if (params.toString() === toSearchParams(filters).toString()) return;
    // Los controles de filtro están arriba y la lista cambia debajo: no hay que volver al inicio.
    setSearchParams(params, { replace, preventScrollReset: true });
  }

  function update(change: Parameters<typeof changeFilters>[1], options?: { replace?: boolean }) {
    navigateTo(changeFilters(filters, change), options);
  }

  function changePage(page: number) {
    update({ page });
    // Del pie de la tabla, donde está la paginación, al inicio de los resultados nuevos.
    resultsRef.current?.scrollIntoView({ block: 'start' });
  }

  function focusSearch() {
    document.getElementById(SEARCH_INPUT_ID)?.focus();
  }

  function clear() {
    navigateTo(clearFilters(filters));
    // El botón desaparece al limpiar; el foco pasa al primer campo del filtro.
    focusSearch();
  }

  function goToFirstPage() {
    update({ page: 1 });
    focusSearch();
  }

  const summary = data && data.items.length > 0 ? describeRange(data) : undefined;

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Postulaciones
          </h1>
          {stats.data && (
            <p className={styles.subtitle}>
              {formatNumber(stats.data.total)}{' '}
              {stats.data.total === 1 ? 'registrada' : 'registradas'} en total.
            </p>
          )}
        </div>
        <Link to="/applications/new" state={listState} className={buttons.primary}>
          + Nueva postulación
        </Link>
      </div>

      <div className={styles.filters}>
        <StatusFilter
          value={filters.status}
          stats={stats.data}
          onChange={(status) => update({ status })}
        />

        <div className={styles.toolbar}>
          <SearchBox
            value={filters.q ?? ''}
            onSearch={(q) => update({ q }, { replace: true })}
            historyKey={navigationType === 'POP' ? location.key : undefined}
          />
          <div className={styles.field}>
            <label htmlFor="applications-from" className={styles.label}>
              Desde
            </label>
            <input
              id="applications-from"
              type="date"
              className={styles.dateInput}
              value={filters.applied_from ?? ''}
              max={filters.applied_to}
              onChange={(event) => update({ applied_from: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="applications-to" className={styles.label}>
              Hasta
            </label>
            <input
              id="applications-to"
              type="date"
              className={styles.dateInput}
              value={filters.applied_to ?? ''}
              min={filters.applied_from}
              onChange={(event) => update({ applied_to: event.target.value })}
            />
          </div>
        </div>

        {filtered && (
          <div className={styles.clearRow}>
            <button type="button" className={buttons.secondary} onClick={clear}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <p ref={resultsRef} className={styles.summary}>
        {summary}
      </p>

      {showErrorPanel ? (
        <StateMessage
          ref={errorRef}
          role="alert"
          title="No se pudieron cargar las postulaciones"
          actions={
            <button type="button" className={buttons.primary} onClick={() => void refetch()}>
              Reintentar
            </button>
          }
        >
          {error.message}
        </StateMessage>
      ) : !data || (isPlaceholderData && data.items.length === 0) ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        data.total > 0 ? (
          // `?page=9` a mano: la API responde con `items` vacío, no con un error.
          <StateMessage
            title="Esta página no existe"
            actions={
              <button type="button" className={buttons.primary} onClick={goToFirstPage}>
                Ir a la primera página
              </button>
            }
          >
            {`Hay ${formatNumber(data.pages)} ${data.pages === 1 ? 'página' : 'páginas'} de resultados.`}
          </StateMessage>
        ) : filtered ? (
          <StateMessage
            title="Ninguna postulación coincide con los filtros"
            actions={
              <button type="button" className={buttons.primary} onClick={clear}>
                Limpiar filtros
              </button>
            }
          >
            Prueba con otra búsqueda, otro estado u otras fechas.
          </StateMessage>
        ) : (
          <StateMessage
            title="Aún no registras postulaciones"
            actions={
              <Link to="/applications/new" state={listState} className={buttons.primary}>
                Registrar la primera
              </Link>
            }
          >
            Cuando registres una vacante a la que aplicaste, aparecerá aquí.
          </StateMessage>
        )
      ) : (
        <>
          {isError && (
            <div className={styles.errorBanner} role="alert">
              <p>{error.message}</p>
              <button type="button" className={buttons.secondary} onClick={() => void refetch()}>
                Reintentar
              </button>
            </div>
          )}
          <ApplicationsTable
            items={data.items}
            sort={filters.sort}
            onSort={(field: SortField) => update({ sort: nextSort(filters.sort, field) })}
            isRefreshing={isPlaceholderData}
            onDelete={requestDelete}
          />
          <Pagination page={filters.page} pages={data.pages} onPageChange={changePage} />
        </>
      )}

      {/* Anuncia el resultado cuando llega la lista nueva (filtro, orden o página). */}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {summary && data && !isPlaceholderData ? announce(summary, data.pages, data.page) : ''}
      </p>

      {pendingDelete && (
        <ConfirmDialog
          title={`¿Eliminar la postulación a ${pendingDelete.application.company}?`}
          description={`${pendingDelete.application.position}. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          busyLabel="Eliminando…"
          busy={deleteMutation.isPending}
          error={deleteFailure?.message}
          retryable={!deleteFailure?.gone}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </>
  );
}

/** "Mostrando 1–20 de 24". */
function describeRange(data: { page: number; per_page: number; total: number; items: unknown[] }) {
  const from = (data.page - 1) * data.per_page + 1;
  const to = from + data.items.length - 1;
  return `Mostrando ${formatNumber(from)}–${formatNumber(to)} de ${formatNumber(data.total)}`;
}

function announce(summary: string, pages: number, page: number): string {
  return pages > 1 ? `${summary}. Página ${page} de ${pages}.` : `${summary}.`;
}
