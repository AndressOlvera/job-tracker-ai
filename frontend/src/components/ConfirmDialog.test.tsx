import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

interface HarnessProps {
  busy?: boolean;
  error?: string;
  retryable?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

/** Una página con un botón que abre el diálogo, para probar foco, fondo inerte y cierre. */
function Harness({ onConfirm = () => {}, onCancel = () => {}, ...props }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div id="app">
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
      </div>
      {open && (
        <ConfirmDialog
          title="¿Eliminar la postulación a Oracle?"
          description="Becario de Software. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          busyLabel="Eliminando…"
          onConfirm={onConfirm}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
          {...props}
        />
      )}
    </>
  );
}

async function openDialog(props: HarnessProps = {}) {
  const user = userEvent.setup();
  const result = render(<Harness {...props} />);
  await user.click(screen.getByRole('button', { name: 'Abrir' }));
  return { user, ...result };
}

const cancel = () => screen.getByRole('button', { name: 'Cancelar' });
const confirm = () => screen.getByRole('button', { name: 'Eliminar' });

describe('ConfirmDialog', () => {
  it('es un alertdialog modal con título y descripción accesibles', async () => {
    await openDialog();
    const dialog = screen.getByRole('alertdialog', { name: '¿Eliminar la postulación a Oracle?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      'Becario de Software. Esta acción no se puede deshacer.',
    );
    expect(
      screen.getByRole('heading', { name: '¿Eliminar la postulación a Oracle?' }),
    ).toBeVisible();
  });

  it('se dibuja en el body, deja la página inerte mientras está abierto y la libera al cerrar', async () => {
    const { user } = await openDialog();
    const page = document.getElementById('app')?.parentElement as HTMLElement;
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(page).toHaveAttribute('inert');
    expect(dialog.closest('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(cancel());

    expect(page).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('el foco empieza en Cancelar', async () => {
    await openDialog();
    expect(cancel()).toHaveFocus();
  });

  it('Cancelar y Eliminar llaman a su función', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { user } = await openDialog({ onConfirm, onCancel });

    await user.click(confirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(cancel());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Enter sobre Cancelar cancela y no confirma', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { user } = await openDialog({ onConfirm, onCancel });
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Esc cancela', async () => {
    const onCancel = vi.fn();
    const { user } = await openDialog({ onCancel });
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('un clic en el fondo cancela, uno dentro del diálogo no', async () => {
    const onCancel = vi.fn();
    const { user } = await openDialog({ onCancel });
    const dialog = screen.getByRole('alertdialog');

    await user.click(dialog);
    await user.click(screen.getByRole('heading'));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('soltar en el fondo un arrastre que empezó dentro no cancela', async () => {
    const onCancel = vi.fn();
    const { user } = await openDialog({ onCancel });
    const dialog = screen.getByRole('alertdialog');
    const overlay = dialog.parentElement as HTMLElement;

    await user.pointer([
      { keys: '[MouseLeft>]', target: dialog },
      { target: overlay },
      { keys: '[/MouseLeft]' },
    ]);

    expect(onCancel).not.toHaveBeenCalled();
  });

  describe('foco atrapado', () => {
    it('Tab y Shift+Tab giran entre Cancelar y Eliminar', async () => {
      const { user } = await openDialog();
      expect(cancel()).toHaveFocus();
      await user.tab();
      expect(confirm()).toHaveFocus();
      await user.tab();
      expect(cancel()).toHaveFocus();
      await user.tab({ shift: true });
      expect(confirm()).toHaveFocus();
      await user.tab({ shift: true });
      expect(cancel()).toHaveFocus();
    });

    it('si el foco se pierde fuera del diálogo, Tab lo trae de vuelta', async () => {
      const { user } = await openDialog();
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();
      await user.tab();
      expect(cancel()).toHaveFocus();
    });

    it('Enter sobre Eliminar confirma', async () => {
      const onConfirm = vi.fn();
      const { user } = await openDialog({ onConfirm });
      await user.tab();
      await user.keyboard('{Enter}');
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('mientras la acción va en camino (busy)', () => {
    it('Eliminar dice "Eliminando…" y los dos botones se deshabilitan', async () => {
      await openDialog({ busy: true });
      expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled();
      expect(cancel()).toBeDisabled();
      expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-busy', 'true');
    });

    it('Esc y el clic en el fondo no cancelan', async () => {
      const onCancel = vi.fn();
      const { user } = await openDialog({ busy: true, onCancel });
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('alertdialog').parentElement as HTMLElement);
      expect(onCancel).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('el foco pasa al diálogo (no a <body>) y Tab no se escapa', async () => {
      const { user } = await openDialog({ busy: true });
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveFocus();
      await user.tab();
      expect(dialog).toHaveFocus();
      await user.tab({ shift: true });
      expect(dialog).toHaveFocus();
    });

    it('al terminar con error, el foco vuelve a Cancelar', async () => {
      const user = userEvent.setup();
      const props = {
        title: 'Título',
        description: 'Descripción',
        confirmLabel: 'Eliminar',
        busyLabel: 'Eliminando…',
        onConfirm: () => {},
        onCancel: () => {},
      };
      const { rerender } = render(<ConfirmDialog {...props} busy />);
      expect(screen.getByRole('alertdialog')).toHaveFocus();

      rerender(<ConfirmDialog {...props} error="Falló" />);

      expect(cancel()).toHaveFocus();
      expect(screen.getByRole('alert')).toHaveTextContent('Falló');
      await user.tab();
      expect(confirm()).toHaveFocus();
    });
  });

  describe('error', () => {
    it('se anuncia dentro del diálogo y se puede reintentar', async () => {
      const onConfirm = vi.fn();
      const { user } = await openDialog({ error: 'No se pudo eliminar.', onConfirm });
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('No se pudo eliminar.');
      expect(screen.getByRole('alertdialog')).toContainElement(alert);
      await user.click(confirm());
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('sin error no hay alerta', async () => {
      await openDialog();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('sin reintento solo queda "Cerrar", que cancela', async () => {
      const onCancel = vi.fn();
      const { user } = await openDialog({ error: 'Ya no existe.', retryable: false, onCancel });
      expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Cerrar' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra el texto como texto, no como HTML', async () => {
    render(
      <ConfirmDialog
        title="¿Eliminar a <img src=x onerror=alert(1)>?"
        description="<b>negrita</b>"
        confirmLabel="Eliminar"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.querySelector('b')).toBeNull();
    expect(screen.getByRole('heading')).toHaveTextContent(
      '¿Eliminar a <img src=x onerror=alert(1)>?',
    );
  });

  it('no deja el fondo inerte si ya lo estaba antes de abrirse', async () => {
    const outside = document.createElement('div');
    outside.setAttribute('inert', '');
    document.body.append(outside);
    const { user } = await openDialog();
    await user.click(cancel());
    expect(outside).toHaveAttribute('inert');
    outside.remove();
  });
});
