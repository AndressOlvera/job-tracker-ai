import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { App } from '../App';
import { routes as appRoutes } from '../routes';

/**
 * QueryClient nuevo para cada prueba (ADR-012): sin reintentos, para que un error de la API
 * se vea de inmediato, y sin caché compartida con otras pruebas.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

interface RenderWithProvidersOptions {
  /** Rutas a montar. Por defecto, las de la app; pasa otras para probar un componente suelto. */
  routes?: RouteObject[];
  /** Por si la prueba necesita sembrar la caché antes de renderizar. */
  queryClient?: QueryClient;
}

/**
 * Monta la app en `route` (p. ej. `/?status=interview`, ADR-013) con un router en memoria y un
 * QueryClient nuevo. Devuelve lo de `render` más `user` (user-event), `router` (para revisar la
 * URL con `router.state.location`) y `queryClient`.
 */
export function renderWithProviders(
  route = '/',
  { routes = appRoutes, queryClient = createTestQueryClient() }: RenderWithProvidersOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const user = userEvent.setup();
  const result = render(<App router={router} queryClient={queryClient} />);
  return { ...result, user, router, queryClient };
}
