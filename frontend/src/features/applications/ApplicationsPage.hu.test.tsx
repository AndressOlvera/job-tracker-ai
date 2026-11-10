/**
 * Aceptación de la issue #13 contra HU-02, HU-03 y HU-07 y el contrato con la issue #14. Usa una API
 * en memoria (`fakeBackend`) para comprobar lo que ve el usuario, no solo lo que se manda.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '../../api/types';
import { jsonResponse, makeApplication, makeApplicationList } from '../../test/api';
import {
  bodyRows,
  fakeBackend,
  findTable,
  makeItems,
  pagedList,
  stubApi,
} from '../../test/listApi';
import { renderWithProviders } from '../../test/renderWithProviders';
import { getReturnTo } from './listLocation';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

/** 24 postulaciones con fechas distintas: de 2026-09-01 (id 1) a 2026-09-24 (id 24). */
function dataset(): Application[] {
  const statuses = ['applied', 'interview', 'offer', 'rejected'] as const;
  const companies = ['Oracle', 'Bosch', 'Intel', 'Google', 'Amazon', 'Mercado Libre'];
  return Array.from({ length: 24 }, (_, index) =>
    makeApplication({
      id: index + 1,
      company: companies[index % companies.length] + (index >= 6 ? ` ${index}` : ''),
      position: index % 3 === 0 ? 'Becario de Software' : 'Practicante QA',
      status: statuses[index % 4],
      applied_on: `2026-09-${String(index + 1).padStart(2, '0')}`,
      source: index % 2 === 0 ? 'OCC' : null,
    }),
  );
}

function cellsOf(row: HTMLElement) {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent?.trim());
}

describe('HU-02: ver mis postulaciones', () => {
  it('por defecto: orden -applied_on, 20 por página, de la más reciente a la más antigua', async () => {
    const { listRequests } = stubApi({ list: fakeBackend(dataset()) });
    renderWithProviders('/');
    await findTable();

    expect(listRequests()[0]).toEqual({ sort: '-applied_on', page: '1', per_page: '20' });
    expect(bodyRows()).toHaveLength(20);
    // Fecha más reciente primero: id 24 (24/09/2026) y la última fila es el id 5.
    expect(cellsOf(bodyRows()[0])[3]).toBe('24/09/2026');
    expect(cellsOf(bodyRows()[19])[3]).toBe('05/09/2026');
    expect(screen.getByRole('columnheader', { name: /Fecha/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('cada fila muestra empresa, puesto, estado, fecha y fuente', async () => {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList([
            makeApplication({
              id: 7,
              company: 'Oracle',
              position: 'Becario de Software',
              status: 'interview',
              applied_on: '2026-09-28',
              source: 'OCC',
            }),
          ]),
        ),
    });
    renderWithProviders('/');
    await findTable();

    const headers = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.replace(/[⇅↑↓]/g, '').trim());
    expect(headers).toEqual(['Empresa', 'Puesto', 'Estado', 'Fecha', 'Fuente', 'Acciones']);
    expect(cellsOf(bodyRows()[0]).slice(0, 5)).toEqual([
      'Oracle',
      'Becario de Software',
      'Entrevista',
      '28/09/2026',
      'OCC',
    ]);
  });

  it('muestra "Mostrando 1–20 de 24" en la primera página y "21–24 de 24" en la segunda', async () => {
    stubApi();
    const { user } = renderWithProviders('/');
    await findTable();
    expect(screen.getByText('Mostrando 1–20 de 24')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–24 de 24')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(4);
  });

  it('con 1 234 resultados los números usan el formato de México', async () => {
    stubApi({
      list: (url) =>
        jsonResponse(
          makeApplicationList(makeItems(20, 21), {
            page: Number(url.searchParams.get('page')),
            total: 1234,
          }),
        ),
    });
    renderWithProviders('/?page=2');
    expect(await screen.findByText('Mostrando 21–40 de 1,234')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 62')).toBeInTheDocument();
  });

  it('una sola postulación: "Mostrando 1–1 de 1" y sin paginación', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList(makeItems(1))) });
    renderWithProviders('/');
    await findTable();
    expect(screen.getByText('Mostrando 1–1 de 1')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  it('exactamente 20 postulaciones: una sola página, sin paginación', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList(makeItems(20))) });
    renderWithProviders('/');
    await findTable();
    expect(screen.getByText('Mostrando 1–20 de 20')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  it('21 postulaciones: segunda página con una sola fila', async () => {
    stubApi({ list: fakeBackend(dataset().slice(0, 21)) });
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Mostrando 21–21 de 21')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it('una fuente ausente se lee "Sin fuente" y no queda una celda vacía', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    renderWithProviders('/');
    await findTable();
    // id 24 -> índice 23 (impar) -> sin fuente.
    const row = bodyRows()[0];
    expect(within(row).getByText('Sin fuente')).toBeInTheDocument();
  });
});

describe('HU-03: filtrar y buscar (flujo completo contra una API en memoria)', () => {
  it('la búsqueda no distingue mayúsculas y busca en empresa y en puesto', async () => {
    const { listRequests } = stubApi({ list: fakeBackend(dataset()) });
    const { user, router } = renderWithProviders('/');
    await findTable();
    const input = screen.getByLabelText('Buscar');

    // Por empresa.
    await user.type(input, 'ORACLE');
    await waitFor(() => expect(router.state.location.search).toBe('?q=ORACLE'));
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'ORACLE' }));
    const upper = await waitFor(() => {
      const rows = bodyRows().map((row) => cellsOf(row)[0]);
      expect(rows).toHaveLength(4);
      for (const company of rows) expect(company).toMatch(/^Oracle/);
      return rows;
    });

    // Con otras mayúsculas: mismo resultado (la API decide, la petición lleva `q` tal cual).
    await user.clear(input);
    await user.type(input, 'oRaCle');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'oRaCle' }));
    await waitFor(() => expect(bodyRows().map((row) => cellsOf(row)[0])).toEqual(upper));

    // Por puesto.
    await user.clear(input);
    await user.type(input, 'PRACTICANTE qa');
    await waitFor(() => expect(listRequests().at(-1)).toMatchObject({ q: 'PRACTICANTE qa' }));
    await waitFor(() => {
      const positions = bodyRows().map((row) => cellsOf(row)[1]);
      expect(positions.length).toBeGreaterThan(0);
      expect(new Set(positions)).toEqual(new Set(['Practicante QA']));
    });
  });

  it('la búsqueda con % y _ viaja codificada y sin interpretar', async () => {
    const { listUrls } = stubApi({ list: fakeBackend(dataset()) });
    const { user, router } = renderWithProviders('/');
    await findTable();
    await user.type(screen.getByLabelText('Buscar'), '100%_');
    await waitFor(() => expect(router.state.location.search).toBe('?q=100%25_'));
    await waitFor(() => expect(listUrls().at(-1)?.searchParams.get('q')).toBe('100%_'));
    // Sin resultados: es una búsqueda, no un error.
    expect(await screen.findByText('Ninguna postulación coincide con los filtros')).toBeVisible();
  });

  it('el rango de fechas es inclusivo en los dos extremos', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    renderWithProviders('/?applied_from=2026-09-10&applied_to=2026-09-12');
    await findTable();
    expect(bodyRows().map((row) => cellsOf(row)[3])).toEqual([
      '12/09/2026',
      '11/09/2026',
      '10/09/2026',
    ]);
  });

  it('"Desde" igual a "Hasta" muestra solo ese día', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    renderWithProviders('/?applied_from=2026-09-15&applied_to=2026-09-15');
    await findTable();
    expect(bodyRows().map((row) => cellsOf(row)[3])).toEqual(['15/09/2026']);
  });

  it('un rango sin postulaciones lo dice y ofrece limpiar', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    renderWithProviders('/?applied_from=2025-01-01&applied_to=2025-12-31');
    expect(
      await screen.findByText('Ninguna postulación coincide con los filtros'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(2);
  });

  it('estado + búsqueda + fechas + orden se combinan, en una sola petición y en la URL', async () => {
    const { listRequests } = stubApi({ list: fakeBackend(dataset()) });
    const { user, router } = renderWithProviders('/');
    await findTable();

    await user.click(screen.getByRole('button', { name: /Postulado/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-20' } });
    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Empresa/ }));
    await user.type(screen.getByLabelText('Buscar'), 'software');

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        '?status=applied&q=software&applied_from=2026-09-01&applied_to=2026-09-20&sort=company',
      ),
    );
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        status: 'applied',
        q: 'software',
        applied_from: '2026-09-01',
        applied_to: '2026-09-20',
        sort: 'company',
        page: '1',
        per_page: '20',
      }),
    );
    await waitFor(() => {
      const rows = bodyRows();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const [, position, status, date] = cellsOf(row);
        expect(position).toBe('Becario de Software');
        expect(status).toBe('Postulado');
        expect(date! >= '01/09/2026').toBe(true);
      }
      const companies = rows.map((row) => cellsOf(row)[0]!);
      expect(companies).toEqual([...companies].sort((a, b) => a.localeCompare(b)));
    });
  });

  it('"Limpiar filtros" aparece al poner cada filtro desde la interfaz y desaparece al quitarlo', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    const { user } = renderWithProviders('/');
    await findTable();
    const clear = () => screen.queryByRole('button', { name: 'Limpiar filtros' });
    expect(clear()).toBeNull();

    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    expect(clear()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Todas/ }));
    expect(clear()).toBeNull();

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    expect(clear()).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } });
    expect(clear()).toBeNull();

    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-30' } });
    expect(clear()).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } });
    expect(clear()).toBeNull();
  });

  it('ordenar solo no muestra "Limpiar filtros" y limpiar conserva el orden elegido', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    const { user, router } = renderWithProviders('/');
    await findTable();
    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Estado/ }));
    expect(router.state.location.search).toBe('?sort=status');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(router.state.location.search).toBe('?sort=status');
    expect(screen.getByRole('columnheader', { name: /Estado/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('ordenar por Empresa: ascendente y luego descendente reordenan las filas', async () => {
    stubApi({ list: fakeBackend(dataset().slice(0, 6)) });
    const { user } = renderWithProviders('/');
    await findTable();
    const companies = () => bodyRows().map((row) => cellsOf(row)[0]!);
    const header = () => within(screen.getByRole('table')).getByRole('button', { name: /Empresa/ });

    await user.click(header());
    await waitFor(() => expect(companies()).toEqual([...companies()].sort()));
    const asc = companies();
    expect(asc[0]).toBe('Amazon');
    await user.click(header());
    await waitFor(() => expect(companies()).toEqual([...asc].reverse()));
  });

  it('los conteos de los botones de estado no cambian al filtrar', async () => {
    stubApi({ list: fakeBackend(dataset()) });
    const { user } = renderWithProviders('/');
    await findTable();
    await user.click(screen.getByRole('button', { name: /Oferta/ }));
    await waitFor(() => expect(bodyRows()).toHaveLength(6));
    // Siguen los conteos de toda la cuenta (/stats), no los de la lista filtrada.
    expect(screen.getByRole('button', { name: /Todas/ })).toHaveTextContent('24');
    expect(screen.getByRole('button', { name: /Postulado/ })).toHaveTextContent('15');
  });
});

describe('HU-07: abrir la vacante', () => {
  function withUrls(urls: Array<string | null>) {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList(
            urls.map((job_url, index) =>
              makeApplication({ id: index + 1, company: `Empresa${index + 1}`, job_url }),
            ),
          ),
        ),
    });
  }

  it.each([
    'https://www.occ.com.mx/empleo/1',
    'http://ejemplo.com/vacante',
    'HTTPS://EJEMPLO.COM/V',
    'https://ejemplo.com/ruta?a=1&b=2#parte',
  ])('%s es enlace: _blank y rel con noopener y noreferrer', async (url) => {
    withUrls([url]);
    renderWithProviders('/');
    await findTable();
    const link = screen.getByRole('link', { name: /Abrir la vacante de Empresa1/ });
    expect(link).toHaveAttribute('target', '_blank');
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(link.getAttribute('href')).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://ejemplo.com/a',
    'blob:https://ejemplo.com/uuid',
    '//evil.com/x',
    '/ruta/relativa',
    'ejemplo.com',
    'https//roto',
    '',
    '   ',
  ])('job_url %j no se vuelve enlace', async (url) => {
    withUrls([url]);
    const { container } = renderWithProviders('/');
    await findTable();
    expect(screen.queryByRole('link', { name: /Abrir la vacante/ })).toBeNull();
    expect(container.querySelector('a[href^="javascript" i], a[href^="data" i]')).toBeNull();
    // La fila sigue completa: editar y eliminar existen.
    expect(screen.getByRole('link', { name: 'Editar la postulación de Empresa1' })).toBeVisible();
  });

  it('solo las filas con enlace válido muestran ↗', async () => {
    withUrls(['https://a.com', null, 'javascript:alert(1)', 'https://b.com']);
    renderWithProviders('/');
    await findTable();
    const links = screen.getAllByRole('link', { name: /Abrir la vacante/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('abrir la vacante no cambia la URL de la lista ni navega dentro de la app', async () => {
    withUrls(['https://a.com']);
    const { user, router } = renderWithProviders('/?q=data');
    await findTable();
    const link = screen.getByRole('link', { name: /Abrir la vacante/ });
    // jsdom no abre pestañas; basta con que el clic no navegue el router.
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?q=data');
  });
});

describe('textos del usuario en empresa, puesto y notas', () => {
  const HOSTILE = '<img src=x onerror=alert(1)>';

  it('HTML en empresa y puesto aparece como texto, no se interpreta', async () => {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList([
            makeApplication({
              id: 1,
              company: HOSTILE,
              position: '<script>window.__xss = true</script><b>negrita</b>',
              source: '<svg onload=alert(1)>',
              notes: '<iframe src="javascript:alert(1)"></iframe>',
            }),
          ]),
        ),
    });
    const { container } = renderWithProviders('/');
    await findTable();

    expect(screen.getByText(HOSTILE)).toBeInTheDocument();
    expect(
      screen.getByText('<script>window.__xss = true</script><b>negrita</b>'),
    ).toBeInTheDocument();
    expect(screen.getByText('<svg onload=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img, script, b, svg, iframe')).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
    // Las notas no son parte de la lista (docs/04-pantallas.md): no se muestran.
    expect(screen.queryByText(/iframe/)).toBeNull();
    // También en el nombre accesible de los botones, como texto.
    expect(screen.getByRole('link', { name: `Editar la postulación de ${HOSTILE}` })).toBeVisible();
  });

  it('emoji y acentos se muestran tal cual', async () => {
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList([
            makeApplication({
              id: 1,
              company: 'Ñandú 🚀 S.A.',
              position: 'Ingeniería ✨ de datos',
            }),
          ]),
        ),
    });
    renderWithProviders('/');
    await findTable();
    expect(screen.getByText('Ñandú 🚀 S.A.')).toBeInTheDocument();
    expect(screen.getByText('Ingeniería ✨ de datos')).toBeInTheDocument();
  });

  it('textos de 500 caracteres sin espacios: la celda puede partirlos (overflow-wrap) y la fila sigue entera', async () => {
    const long = 'W'.repeat(500);
    stubApi({
      list: () =>
        jsonResponse(
          makeApplicationList([
            makeApplication({ id: 1, company: long, position: long, source: long }),
            makeApplication({ id: 2, company: 'Normal' }),
          ]),
        ),
    });
    renderWithProviders('/');
    await findTable();
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getAllByText(long)).toHaveLength(3);
    // La regla de CSS que evita el desborde existe en la celda (ver ApplicationsTable.module.css).
    const css = readFileSync(join(import.meta.dirname, 'ApplicationsTable.module.css'), 'utf8');
    expect(css).toMatch(/\.company,[\s\S]*?\.cell,[\s\S]*?overflow-wrap:\s*anywhere/);
  });
});

describe('contrato con la issue #14: state.returnTo', () => {
  it('✎ guarda la lista con todos sus filtros', async () => {
    stubApi();
    const { user, router } = renderWithProviders(
      '/?status=interview&q=data&applied_from=2026-01-01&sort=company&page=2',
    );
    await findTable();
    await user.click(screen.getByRole('link', { name: 'Editar la postulación de Empresa 21' }));
    expect(router.state.location.pathname).toBe('/applications/21/edit');
    expect(router.state.location.state).toEqual({
      returnTo: '/?status=interview&q=data&applied_from=2026-01-01&sort=company&page=2',
    });
  });

  it('guarda la URL tal como está, también si trae basura (el formulario la volverá a validar al llegar)', async () => {
    stubApi();
    const { user, router } = renderWithProviders('/?status=hired&foo=bar');
    await findTable();
    await user.click(screen.getByRole('link', { name: '+ Nueva postulación' }));
    expect(getReturnTo(router.state.location.state)).toBe('/?status=hired&foo=bar');
  });

  it('"+ Nueva postulación" sin filtros guarda "/"', async () => {
    stubApi();
    const { user, router } = renderWithProviders('/');
    await findTable();
    await user.click(screen.getByRole('link', { name: '+ Nueva postulación' }));
    expect(router.state.location.state).toEqual({ returnTo: '/' });
  });

  it('"Registrar la primera" guarda la lista y lleva a /applications/new', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList([], { total: 0, pages: 0 })) });
    const { user, router } = renderWithProviders('/?sort=company');
    const link = await screen.findByRole('link', { name: 'Registrar la primera' });
    expect(link).toHaveAttribute('href', '/applications/new');
    await user.click(link);
    expect(router.state.location.pathname).toBe('/applications/new');
    expect(router.state.location.state).toEqual({ returnTo: '/?sort=company' });
  });

  it('el returnTo de la lista llega intacto a getReturnTo', async () => {
    stubApi();
    const { user, router } = renderWithProviders('/?q=100%25_%26');
    await findTable();
    await user.click(screen.getByRole('link', { name: 'Editar la postulación de Empresa 1' }));
    expect(getReturnTo(router.state.location.state)).toBe('/?q=100%25_%26');
  });
});

describe('getReturnTo: destinos que no son de la app', () => {
  it.each([
    '//evil.com',
    '//evil.com/path',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'http://evil.com',
    'https://evil.com/?x=/',
    'HTTP://EVIL.COM',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hola',
    'evil.com',
    '',
    ' /ok',
    'mailto:a@b.c',
  ])('rechaza %j', (returnTo) => {
    expect(getReturnTo({ returnTo })).toBe('/');
  });

  it.each([
    [null],
    [undefined],
    [0],
    [''],
    ['/?status=offer'],
    [[]],
    [['/x']],
    [() => '/x'],
    [new Date()],
    [Symbol('x')],
    [{ returnTo: ['/x'] }],
    [{ returnTo: { toString: () => '/x' } }],
    [{ returnTo: new String('/x') }],
    [{ returnTo: Symbol('x') }],
    [{ returnTo: 1n }],
    [{ returnto: '/x' }],
    [{ returnTo: undefined }],
  ])('un state raro (%s) vuelve a "/"', (state) => {
    expect(getReturnTo(state)).toBe('/');
  });

  it.each(['/', '/?status=offer&page=2', '/?q=%2F%2Fevil.com', '/applications/new'])(
    'acepta la ruta interna %s',
    (returnTo) => {
      expect(getReturnTo({ returnTo })).toBe(returnTo);
    },
  );

  // Regresión corregida (reportada en la issue #13).
  it('rechaza destinos con caracteres de control que los navegadores ignoran', () => {
    for (const returnTo of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\u0000/evil.com']) {
      expect(getReturnTo({ returnTo }), JSON.stringify(returnTo)).toBe('/');
    }
  });
});

describe('estados: casos que faltaban', () => {
  it('después de cargar, ya no queda nada marcado como ocupado ni el esqueleto', async () => {
    stubApi({ list: pagedList });
    const { container } = renderWithProviders('/');
    await findTable();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByText('Cargando postulaciones…')).toBeNull();
  });

  it('sin postulaciones y sin filtros no ofrece "Limpiar filtros"', async () => {
    stubApi({ list: () => jsonResponse(makeApplicationList([], { total: 0, pages: 0 })) });
    renderWithProviders('/?sort=company');
    expect(await screen.findByText('Aún no registras postulaciones')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/Mostrando/)).toBeNull();
  });
});
