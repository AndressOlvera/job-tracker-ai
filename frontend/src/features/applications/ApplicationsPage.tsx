import { Link } from 'react-router';

/** Lista de postulaciones (`/`). Marcador: la issue #13 agrega tabla, filtros y paginación. */
export function ApplicationsPage() {
  return (
    <>
      <h1>Postulaciones</h1>
      <Link to="/applications/new">Nueva postulación</Link>
    </>
  );
}
