import { useRef, type MouseEvent } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import styles from './Layout.module.css';

/** Barra superior y contenido principal, comunes a todas las pantallas. */
export function Layout() {
  const mainRef = useRef<HTMLElement>(null);

  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    // Mueve el foco sin cambiar la URL: un `#contenido` en la dirección sería una navegación más.
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <>
      <a href="#contenido" className={styles.skipLink} onClick={skipToContent}>
        Saltar al contenido
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.logo} aria-hidden="true" />
            Job Tracker
          </Link>
          <nav aria-label="Principal">
            <ul className={styles.navList}>
              <li>
                {/* `end`: solo se marca activa en `/`, no en cualquier ruta que empiece con `/`. */}
                <NavLink to="/" end className={styles.navLink}>
                  Postulaciones
                </NavLink>
              </li>
              <li>
                <NavLink to="/stats" className={styles.navLink}>
                  Estadísticas
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="contenido" ref={mainRef} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      {/* Al cambiar de pantalla se empieza arriba; con atrás/adelante se recupera la posición. */}
      <ScrollRestoration />
    </>
  );
}
