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

/**
 * Un borrado (éxito o 404) deja la caché desactualizada, pero NO espera a la lectura nueva: la
 * mutación se resuelve en cuanto responde el DELETE y las listas y estadísticas se refrescan en
 * segundo plano. Si esa lectura tardara o fallara, el borrado ya ocurrió y el diálogo de
 * confirmación no debe quedarse en "Eliminando…". Las invalidaciones se piden de forma síncrona
 * (queda marcada la caché antes de que la pantalla haga algo más), solo no se espera su resultado.
 *
 * El detalle se quita de la caché. Si una pantalla aún tiene ese detalle montado, al redibujarse
 * crea la consulta de nuevo y la pide (daría 404): quien borra debe salir de esa pantalla. La
 * lista no abre detalles, así que hoy no ocurre.
 */
function dropDeleted(queryClient: QueryClient, id: number) {
  queryClient.removeQueries({ queryKey: applicationKeys.detail(id), exact: true });
  // Mientras llega la lista nueva, la que está en caché ya no muestra la fila borrada ni la cuenta.
  queryClient.setQueriesData<ApplicationList>({ queryKey: applicationKeys.lists() }, (list) => {
    // `undefined` deja esa lista como está (sin marcarla como recién actualizada).
    if (!list?.items.some((item) => item.id === id)) return undefined;
    const total = Math.max(0, list.total - 1);
    return {
      ...list,
      items: list.items.filter((item) => item.id !== id),
      total,
      pages: Math.ceil(total / list.per_page),
    };
  });
  // Sin `await`. `invalidateQueries` no rechaza si la lectura falla (el error queda en la consulta).
  void invalidateListsAndStats(queryClient);
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: deleteApplication,
    onSuccess: (_data, id) => dropDeleted(queryClient, id),
    onError: (error, id) => {
      // Un 404 es que ya la habían borrado (otra pestaña): la lista en pantalla está desactualizada.
      if (error.status === 404) dropDeleted(queryClient, id);
    },
  });
}
