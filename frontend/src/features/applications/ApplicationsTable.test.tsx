import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSort } from '../../api/types';
import { makeApplication } from '../../test/api';
import { ApplicationsTable } from './ApplicationsTable';

function renderTable(
  props: Partial<React.ComponentProps<typeof ApplicationsTable>> = {},
  route = '/',
) {
  const onSort = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <ApplicationsTable
        items={[makeApplication()]}
        sort="-applied_on"
        onSort={onSort}
        {...props}
      />
    </MemoryRouter>,
  );
  return { ...view, onSort, user };
}

describe('ApplicationsTable', () => {
  it('muestra las columnas y una fila por postulación', () => {
    renderTable({
      items: [
        makeApplication({ id: 1, company: 'Oracle', position: 'Becario de Software' }),
        makeApplication({ id: 2, company: 'Bosch', position: 'Practicante QA', source: null }),
      ],
    });
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Empresa⇅', 'Puesto', 'Estado⇅', 'Fecha↓', 'Fuente', 'Acciones']);
    // Una fila de encabezados y una por postulación.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: 'Oracle' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Practicante QA' })).toBeInTheDocument();
  });

  it('el estado es una etiqueta con su nombre en español', () => {
    renderTable({ items: [makeApplication({ status: 'rejected' })] });
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
  });

  it.each([
    ['2026-09-28', '28/09/2026'],
    ['2026-01-01', '01/01/2026'],
    ['2026-12-31', '31/12/2026'],
  ])('la fecha %s se ve como %s, sin restar un día por la zona horaria', (iso, shown) => {
    renderTable({ items: [makeApplication({ applied_on: iso })] });
    expect(screen.getByText(shown)).toBeInTheDocument();
  });

  it('una fuente vacía se ve como "—" y se lee como "Sin fuente"', () => {
    renderTable({ items: [makeApplication({ source: null })] });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Sin fuente')).toBeInTheDocument();
  });

  it('muestra la fuente cuando existe', () => {
    renderTable({ items: [makeApplication({ source: 'OCC' })] });
    expect(screen.getByRole('cell', { name: 'OCC' })).toBeInTheDocument();
    expect(screen.queryByText('Sin fuente')).not.toBeInTheDocument();
  });

  describe('orden', () => {
    it.each<[ApplicationSort, string, string, string]>([
      ['-applied_on', 'none', 'none', 'descending'],
      ['applied_on', 'none', 'none', 'ascending'],
      ['company', 'ascending', 'none', 'none'],
      ['-company', 'descending', 'none', 'none'],
      ['status', 'none', 'ascending', 'none'],
      ['-created_at', 'none', 'none', 'none'],
    ])('con sort=%s: Empresa %s, Estado %s, Fecha %s', (sort, company, status, date) => {
      renderTable({ sort });
      expect(screen.getByRole('columnheader', { name: /Empresa/ })).toHaveAttribute(
        'aria-sort',
        company,
      );
      expect(screen.getByRole('columnheader', { name: /Estado/ })).toHaveAttribute(
        'aria-sort',
        status,
      );
      expect(screen.getByRole('columnheader', { name: /Fecha/ })).toHaveAttribute(
        'aria-sort',
        date,
      );
    });

    it('los encabezados que ordenan son botones y los demás no', () => {
      renderTable();
      expect(screen.getAllByRole('button', { name: /Empresa|Estado|Fecha/ })).toHaveLength(3);
      expect(
        within(screen.getByRole('columnheader', { name: 'Puesto' })).queryByRole('button'),
      ).toBeNull();
      expect(screen.getByRole('columnheader', { name: 'Puesto' })).not.toHaveAttribute('aria-sort');
    });

    it('muestra ⇅ en las columnas sin orden y ↑ o ↓ en la activa', () => {
      const { rerender } = renderTable({ sort: 'company' });
      expect(screen.getByRole('button', { name: 'Empresa' })).toHaveTextContent('↑');
      expect(screen.getByRole('button', { name: 'Estado' })).toHaveTextContent('⇅');
      rerender(
        <MemoryRouter>
          <ApplicationsTable items={[makeApplication()]} sort="-company" onSort={vi.fn()} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: 'Empresa' })).toHaveTextContent('↓');
    });

    it('un clic en el encabezado avisa qué campo se quiere ordenar', async () => {
      const { user, onSort } = renderTable();
      await user.click(screen.getByRole('button', { name: 'Empresa' }));
      expect(onSort).toHaveBeenLastCalledWith('company');
      await user.click(screen.getByRole('button', { name: 'Estado' }));
      expect(onSort).toHaveBeenLastCalledWith('status');
      await user.click(screen.getByRole('button', { name: 'Fecha' }));
      expect(onSort).toHaveBeenLastCalledWith('applied_on');
    });

    it('se puede ordenar con el teclado', async () => {
      const { user, onSort } = renderTable();
      screen.getByRole('button', { name: 'Empresa' }).focus();
      await user.keyboard('{Enter}');
      expect(onSort).toHaveBeenCalledWith('company');
    });
  });

  describe('enlace a la vacante (↗)', () => {
    it('abre en una pestaña nueva, con rel seguro y un nombre que lo avisa', () => {
      renderTable({
        items: [makeApplication({ company: 'Oracle', job_url: 'https://www.occ.com.mx/empleo/1' })],
      });
      const link = screen.getByRole('link', {
        name: 'Abrir la vacante de Oracle (se abre en una pestaña nueva)',
      });
      expect(link).toHaveAttribute('href', 'https://www.occ.com.mx/empleo/1');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('no hay enlace cuando la postulación no tiene job_url', () => {
      renderTable({ items: [makeApplication({ job_url: null })] });
      expect(screen.queryByRole('link', { name: /Abrir la vacante/ })).not.toBeInTheDocument();
      // El resto de las acciones sigue.
      expect(screen.getByRole('link', { name: /Editar/ })).toBeInTheDocument();
    });

    it.each(['javascript:alert(1)', 'data:text/html,hola', 'ftp://example.com/x'])(
      'no convierte %s en enlace',
      (job_url) => {
        renderTable({ items: [makeApplication({ job_url })] });
        expect(screen.queryByRole('link', { name: /Abrir la vacante/ })).not.toBeInTheDocument();
      },
    );
  });

  describe('editar (✎)', () => {
    it('lleva al formulario de esa postulación', () => {
      renderTable({ items: [makeApplication({ id: 7, company: 'Intel' })] });
      expect(screen.getByRole('link', { name: 'Editar la postulación de Intel' })).toHaveAttribute(
        'href',
        '/applications/7/edit',
      );
    });

    it('guarda la URL actual de la lista para volver con los mismos filtros', async () => {
      function StateProbe() {
        const { state } = useLocation();
        return <output data-testid="state">{JSON.stringify(state)}</output>;
      }
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/?status=interview&page=2']}>
          <ApplicationsTable items={[makeApplication()]} sort="-applied_on" onSort={vi.fn()} />
          <StateProbe />
        </MemoryRouter>,
      );
      await user.click(screen.getByRole('link', { name: /Editar/ }));
      expect(screen.getByTestId('state')).toHaveTextContent(
        JSON.stringify({ returnTo: '/?status=interview&page=2' }),
      );
    });
  });

  describe('eliminar (✕)', () => {
    it('sin onDelete el botón está deshabilitado pero tiene nombre', () => {
      renderTable({ items: [makeApplication({ company: 'Oracle' })] });
      expect(
        screen.getByRole('button', { name: 'Eliminar la postulación de Oracle' }),
      ).toBeDisabled();
    });

    it('con onDelete avisa qué postulación se quiere eliminar', async () => {
      const onDelete = vi.fn();
      const application = makeApplication({ id: 9, company: 'Bosch' });
      const { user } = renderTable({ items: [application], onDelete });
      await user.click(screen.getByRole('button', { name: 'Eliminar la postulación de Bosch' }));
      expect(onDelete).toHaveBeenCalledExactlyOnceWith(application);
    });
  });

  it('mientras llega la página nueva se atenúa y se marca como ocupada, sin quitar las filas', () => {
    const { container } = renderTable({ isRefreshing: true });
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('cell', { name: 'Oracle' })).toBeInTheDocument();
  });
});
