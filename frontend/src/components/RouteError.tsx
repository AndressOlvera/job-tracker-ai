import { Link } from 'react-router';

/**
 * Se muestra cuando una pantalla falla al dibujarse. Sustituye al aviso en inglés de React Router.
 * Los errores de la API no llegan aquí: cada pantalla los muestra con su botón "Reintentar".
 */
export function RouteError() {
  return (
    <div role="alert">
      <h1>Algo salió mal</h1>
      <p>Ocurrió un error inesperado al mostrar esta pantalla. Intenta recargar la página.</p>
      <Link to="/">Ir a postulaciones</Link>
    </div>
  );
}
