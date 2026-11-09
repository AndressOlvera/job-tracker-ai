import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { NotFoundPage } from './components/NotFoundPage';
import { RouteError } from './components/RouteError';
import { ApplicationFormPage } from './features/applications/ApplicationFormPage';
import { ApplicationsPage } from './features/applications/ApplicationsPage';
import { StatsPage } from './features/stats/StatsPage';

/**
 * Rutas de la app (docs/04-pantallas.md → Navegación).
 * Las mismas rutas se montan en el navegador (main.tsx) y en las pruebas (renderWithProviders).
 */
export const routes: RouteObject[] = [
  {
    Component: Layout,
    children: [
      {
        // Ruta sin path: si una pantalla falla, el aviso aparece dentro del layout
        // y la barra superior sigue disponible para salir de ahí.
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: ApplicationsPage },
          { path: 'applications/new', Component: ApplicationFormPage },
          { path: 'applications/:id/edit', Component: ApplicationFormPage },
          { path: 'stats', Component: StatsPage },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
];
