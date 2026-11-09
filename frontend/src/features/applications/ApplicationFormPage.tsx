import { Link, useParams } from 'react-router';

/**
 * Nueva postulación (`/applications/new`) y edición (`/applications/:id/edit`): la misma pantalla
 * sirve para las dos (docs/04-pantallas.md). Marcador: la issue #14 agrega el formulario.
 */
export function ApplicationFormPage() {
  const { id } = useParams();
  const isEditing = id !== undefined;

  return (
    <>
      <Link to="/">
        <span aria-hidden="true">← </span>Volver a postulaciones
      </Link>
      <h1>{isEditing ? 'Editar postulación' : 'Nueva postulación'}</h1>
      <p>
        {isEditing
          ? 'Actualiza los datos de esta postulación.'
          : 'Registra una vacante a la que aplicaste.'}
      </p>
    </>
  );
}
