/**
 * Datos de la API para las pantallas (ADR-012). Las pantallas usan solo estos hooks; ninguna
 * hace `fetch` por su cuenta ni arma llaves de consulta a mano.
 */
import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  compactFilters,
  createApplication,
  deleteApplication,
  getApplication,
  getStats,
  listApplications,
  updateApplication,
  type ApiError,
} from './client';
import type {
  Application,
  ApplicationFilters,
  ApplicationInput,
  ApplicationList,
  ApplicationPatch,
  Stats,
} from './types';

/**
 * Llaves de consulta. Todas las de postulaciones empiezan con `applications`, así se pueden
 * invalidar juntas o por grupo (solo las listas, solo un detalle).
 */
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  // Sin los filtros vacíos: `{}` y `{ q: '' }` piden lo mismo y deben compartir caché.
  list: (filters: ApplicationFilters) =>
    [...applicationKeys.lists(), compactFilters(filters)] as const,
  details: () => [...applicationKeys.all, 'detail'] as const,
  detail: (id: number | undefined) => [...applicationKeys.details(), id] as const,
};

export const statsKeys = {
  all: ['stats'] as const,
};

/**
 * Una página de la lista. Al cambiar de filtro o de página la lista actual sigue visible
 * (`isPlaceholderData` es `true`) hasta que llega la nueva, y la petición anterior se cancela.
 */
export function useApplications(filters: ApplicationFilters) {
  return useQuery<ApplicationList, ApiError>({
    queryKey: applicationKeys.list(filters),
    queryFn: ({ signal }) => listApplications(filters, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Una postulación, para llenar el formulario de edición. Sin `id` (pantalla de nueva
 * postulación) no hace la petición, así el formulario usa el mismo hook en los dos modos.
 */
export function useApplication(id: number | undefined) {
  return useQuery<Application, ApiError>({
    queryKey: applicationKeys.detail(id),
    queryFn: id === undefined ? skipToken : ({ signal }) => getApplication(id, signal),
  });
}

export function useStats() {
  return useQuery<Stats, ApiError>({
    queryKey: statsKeys.all,
    queryFn: ({ signal }) => getStats(signal),
  });
}

/**
 * Después de crear, editar o eliminar cambian las listas y las estadísticas (ADR-012).
 * Devuelve la promesa para que la mutación termine cuando las consultas en pantalla ya se
 * actualizaron, y quien navegue después vea datos frescos.
 * Los detalles no se invalidan: cada mutación pone o quita el suyo, y los demás no cambian.
 */
function invalidateListsAndStats(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: applicationKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: statsKeys.all }),
  ]);
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation<Application, ApiError, ApplicationInput>({
    mutationFn: createApplication,
    onSuccess: () => invalidateListsAndStats(queryClient),
  });
}

export interface UpdateApplicationVariables {
  id: number;
  patch: ApplicationPatch;
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation<Application, ApiError, UpdateApplicationVariables>({
    mutationFn: ({ id, patch }) => updateApplication(id, patch),
    onSuccess: (application) => {
      // La respuesta ya es la versión nueva: no hace falta volver a pedir el detalle.
      queryClient.setQueryData(applicationKeys.detail(application.id), application);
      return invalidateListsAndStats(queryClient);
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: deleteApplication,
    onSuccess: (_data, id) => {
      // Se quita antes de invalidar para que nadie intente volver a pedir algo que ya no existe.
      queryClient.removeQueries({ queryKey: applicationKeys.detail(id), exact: true });
      return invalidateListsAndStats(queryClient);
    },
  });
}
