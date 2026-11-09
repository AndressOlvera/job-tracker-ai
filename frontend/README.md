# Frontend · Job Tracker

React + TypeScript con Vite, React Router y TanStack Query. Estilos con CSS Modules.

## Instalar

Necesitas Node 24 (`.nvmrc`; con nvm: `nvm use`).

```bash
npm ci
```

## Correr en local

1. Levanta la API con `flask run` desde `backend/` (escucha en `http://127.0.0.1:5000`).
2. Desde `frontend/`:

   ```bash
   npm run dev
   ```

3. Abre `http://localhost:5173`.

Vite redirige todo lo que empieza con `/api` hacia Flask, así el navegador habla con un solo
origen y no hace falta CORS ([ADR-005](../docs/05-decisiones.md#adr-005-mismo-origen-para-frontend-y-api)).
`npm run preview` (el build ya compilado) usa el mismo proxy.

### `API_PROXY_TARGET`

Cambia hacia dónde va el proxy de `/api`. Por defecto es `http://127.0.0.1:5000`.

```bash
API_PROXY_TARGET=http://localhost:8000 npm run dev
```

También se puede poner en un `frontend/.env.local` (Git lo ignora). No se expone al navegador.

## Checks

Los mismos que corre la CI:

| Comando                  | Qué hace                                                 |
| ------------------------ | -------------------------------------------------------- |
| `npm run lint`           | ESLint                                                   |
| `npm run format:check`   | Prettier (`npm run format` corrige el formato)           |
| `npm run typecheck`      | `tsc` sobre la app, las pruebas y `vite.config.ts`       |
| `npm test`               | Vitest con React Testing Library                         |
| `npm test -- --coverage` | Igual, más cobertura en `coverage/` (`lcov.info` y HTML) |
| `npm run build`          | Compila a `dist/`                                        |

## Estructura

```text
src/
  api/          cliente de la API, tipos, consultas y QueryClient
  components/   layout y piezas compartidas
  features/
    applications/   lista, formulario y filtros
    stats/          pantalla de estadísticas y cálculos de las gráficas
  styles/       CSS global y variables (colores de cada estado, espacios)
  test/         configuración y utilidades de las pruebas
  routes.ts     rutas de la app
```

Para probar una pantalla usa `renderWithProviders('/ruta?filtros')` de `src/test/`: monta la app con un
router en memoria y un `QueryClient` nuevo sin reintentos ([ADR-012](../docs/05-decisiones.md#adr-012-tanstack-query-para-los-datos-de-la-api)).
