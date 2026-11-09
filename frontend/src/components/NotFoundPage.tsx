import { Link } from 'react-router';

/** Cualquier ruta que no exista (docs/04-pantallas.md → Navegación). */
export function NotFoundPage() {
  return (
    <>
      <h1>Página no encontrada</h1>
      <p>La dirección que abriste no existe o cambió.</p>
      <Link to="/">Ir a postulaciones</Link>
    </>
  );
}
