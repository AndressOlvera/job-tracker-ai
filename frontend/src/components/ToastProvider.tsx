import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi } from './toastContext';
import styles from './ToastProvider.module.css';

/** Cuánto dura un aviso en pantalla antes de cerrarse solo. */
export const TOAST_DURATION_MS = 6000;

interface ActiveToast {
  /** Cambia con cada aviso, aunque el texto se repita, para reiniciar el temporizador. */
  id: number;
  message: string;
}

/**
 * Muestra los avisos de `useToast().show(...)`. La región `role="status"` existe desde el inicio
 * y solo cambia su contenido: así los lectores de pantalla anuncian el aviso al aparecer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  // Con el mouse encima o el foco dentro el aviso no se cierra solo (WCAG 2.2.1).
  const [paused, setPaused] = useState(false);

  const show = useCallback((message: string) => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, message }));
    setPaused(false);
  }, []);

  useEffect(() => {
    if (!toast || paused) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, paused]);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
        {toast && (
          <div
            key={toast.id}
            className={styles.toast}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <p className={styles.message}>{toast.message}</p>
            <button type="button" className={styles.close} onClick={() => setToast(null)}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </ToastContext>
  );
}
