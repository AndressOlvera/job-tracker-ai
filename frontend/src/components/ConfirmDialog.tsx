import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  type PointerEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  /** Texto del botón de confirmar mientras `busy` ("Eliminando…"). */
  busyLabel?: string;
  cancelLabel?: string;
  /** La acción va en camino: se bloquea todo (botones, `Esc` y clic en el fondo). */
  busy?: boolean;
  /** Error de la acción. Se muestra dentro del diálogo, que sigue abierto. */
  error?: string;
  /**
   * Con `false` el error no tiene reintento (p. ej. la postulación ya no existe): se quita el
   * botón de confirmar y el de cancelar pasa a decir `closeLabel`.
   */
  retryable?: boolean;
  closeLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo de confirmación para acciones que no se pueden deshacer. Se monta solo mientras está
 * abierto; quien lo monta decide a dónde regresa el foco al cerrarlo (depende de si el elemento
 * que lo abrió sigue existiendo).
 *
 * Por qué no `<dialog>` con `showModal()`: jsdom (las pruebas) no lo implementa, así que no se
 * podría probar el foco ni el cierre con Esc. Se usa `role="alertdialog"` con `aria-modal`, foco
 * atrapado a mano y `inert` en el resto de la página, que se comporta igual en todos los navegadores.
 *
 * - El foco empieza en Cancelar, la opción segura; `Esc` y el clic en el fondo cancelan.
 * - Con `busy` se bloquean los botones, así que el foco pasa al propio diálogo para no caer en
 *   `<body>`; si la acción falla, vuelve a Cancelar.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancelar',
  busy = false,
  error,
  retryable = true,
  closeLabel = 'Cerrar',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  // El clic en el fondo solo cuenta si también empezó ahí (no al soltar un arrastre de texto).
  const pressedOnOverlay = useRef(false);

  // Esc y Tab. Se escucha en el documento para que siga atrapado aunque el foco se pierda.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    const outside = !active || !dialog.contains(active);
    if (outside || (event.shiftKey && (active === first || active === dialog))) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // Foco inicial en Cancelar.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Foco durante y después de la petición.
  useEffect(() => {
    if (busy) {
      dialogRef.current?.focus();
    } else if (wasBusy.current) {
      cancelRef.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  // Mientras está abierto, el resto de la página no recibe foco ni lector de pantalla, y no hace scroll.
  useEffect(() => {
    const overlay = overlayRef.current;
    const touched = Array.from(document.body.children).filter(
      (element) => element !== overlay && !element.hasAttribute('inert'),
    );
    for (const element of touched) element.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      for (const element of touched) element.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pressedOnOverlay.current = event.target === event.currentTarget;
  }

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    const clean = pressedOnOverlay.current && event.target === event.currentTarget;
    pressedOnOverlay.current = false;
    if (clean && !busy) onCancel();
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      onPointerDown={handlePointerDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        className={styles.dialog}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancel}
            disabled={busy}
            onClick={onCancel}
          >
            {retryable ? cancelLabel : closeLabel}
          </button>
          {retryable && (
            <button type="button" className={styles.confirm} disabled={busy} onClick={onConfirm}>
              {busy && busyLabel ? busyLabel : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
