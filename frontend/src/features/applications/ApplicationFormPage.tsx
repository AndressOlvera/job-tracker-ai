import { Link, useLocation, useParams } from 'react-router';
import { useApplication } from '../../api/queries';
import { parseApplicationId } from './applicationId';
import { ApplicationForm, FORM_TITLE_ID } from './ApplicationForm';
import styles from './ApplicationFormPage.module.css';
import buttons from './listButtons.module.css';
import { getReturnTo } from './listLocation';
import { StateMessage } from './StateMessage';

/**
 * Nueva postulación (`/applications/new`) y edición (`/applications/:id/edit`): la misma pantalla
 * sirve para las dos (docs/04-pantallas.md → 2). Al guardar o cancelar vuelve a la lista con sus
 * filtros (`returnTo`, ADR-013).
 */
export function ApplicationFormPage() {
  const { id: idParam } = useParams();
  const returnTo = getReturnTo(useLocation().state);
  const isEditing = idParam !== undefined;
  const id = idParam === undefined ? undefined : parseApplicationId(idParam);

  return (
    <>
      <Link to={returnTo} className={styles.back}>
        <span aria-hidden="true">← </span>Volver a postulaciones
      </Link>
      <h1 id={FORM_TITLE_ID}>{isEditing ? 'Editar postulación' : 'Nueva postulación'}</h1>
      {isEditing ? (
        id === undefined ? (
          <NotFound returnTo={returnTo} />
        ) : (
          <EditBody id={id} returnTo={returnTo} />
        )
      ) : (
        <>
          <p className={styles.subtitle}>Registra una vacante a la que aplicaste.</p>
          <ApplicationForm key="new" returnTo={returnTo} />
        </>
      )}
    </>
  );
}

/** Carga la postulación y muestra el formulario, o el estado de carga, el 404 o el error. */
function EditBody({ id, returnTo }: { id: number; returnTo: string }) {
  const { data, isPending, error, refetch } = useApplication(id);

  // Con datos en pantalla, un error al refrescar en segundo plano no debe quitar el formulario.
  if (data) {
    return (
      <>
        <p className={styles.subtitle}>Actualiza los datos de esta postulación.</p>
        <ApplicationForm key={id} application={data} returnTo={returnTo} />
      </>
    );
  }
  if (isPending) return <LoadingSkeleton />;
  if (error?.status === 404) return <NotFound returnTo={returnTo} />;
  return (
    <StateMessage
      role="alert"
      title="No se pudo cargar la postulación"
      actions={
        <button type="button" className={buttons.primary} onClick={() => void refetch()}>
          Reintentar
        </button>
      }
    >
      {error?.message}
    </StateMessage>
  );
}

function NotFound({ returnTo }: { returnTo: string }) {
  return (
    <StateMessage
      role="alert"
      title="No encontramos esta postulación"
      actions={
        <Link to={returnTo} className={buttons.primary}>
          Ver postulaciones
        </Link>
      }
    >
      Puede que ya la hayas eliminado.
    </StateMessage>
  );
}

/** Esqueleto del formulario mientras llegan los datos. Los bloques grises son decoración. */
function LoadingSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="visually-hidden">
        Cargando la postulación…
      </p>
      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className={styles.bar} />
        ))}
      </div>
    </div>
  );
}
