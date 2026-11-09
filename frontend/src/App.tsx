import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { DataRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

interface AppProps {
  router: DataRouter;
  queryClient: QueryClient;
}

/**
 * Raíz de la app. Recibe el router y el QueryClient desde fuera para que las pruebas
 * monten la misma app con un router en memoria y un QueryClient nuevo.
 */
export function App({ router, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
