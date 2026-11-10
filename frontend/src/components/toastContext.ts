import { createContext, useContext } from 'react';

export interface ToastApi {
  /** Muestra un aviso breve ("Postulación guardada"). Uno nuevo reemplaza al anterior. */
  show: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Avisos que sobreviven a la navegación: el proveedor vive en `Layout`, que no se desmonta al
 * cambiar de pantalla. Úsalo así, justo antes de navegar:
 *
 *   const toast = useToast();
 *   toast.show('Postulación eliminada');
 *
 * El aviso se anuncia a lectores de pantalla, se cierra solo a los 6 segundos y tiene un botón
 * "Cerrar".
 */
export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return toast;
}
