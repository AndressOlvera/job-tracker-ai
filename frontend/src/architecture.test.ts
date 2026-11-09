/**
 * Reglas de arquitectura (ADR-012, issue #12): solo `src/api/` habla con la red. Las pantallas y
 * los componentes obtienen los datos con los hooks de `src/api/queries.ts`.
 */
import { describe, expect, it } from 'vitest';

// Código fuente como texto (sin ejecutarlo). Las pruebas se excluyen porque simulan `fetch`.
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** `fetch` (llamada o referencia), `window.fetch`, XHR, beacons, sockets y SSE. */
const NETWORK_USE =
  /(?<![\w$.])(?:window\.|globalThis\.|self\.)?fetch\b(?!\w)|\bXMLHttpRequest\b|\bsendBeacon\b|\bEventSource\b|\bWebSocket\b/;

/** Quita comentarios y textos para no confundir una palabra en un comentario con una llamada. */
function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
}

const outsideApi = Object.entries(sources).filter(([file]) => !file.startsWith('/src/api/'));
const insideApi = Object.entries(sources).filter(([file]) => file.startsWith('/src/api/'));

describe('solo src/api/ hace peticiones de red (ADR-012)', () => {
  it('la prueba encuentra los archivos (si no, pasaría sin revisar nada)', () => {
    expect(outsideApi.length).toBeGreaterThan(5);
    expect(insideApi.map(([file]) => file)).toEqual(
      expect.arrayContaining(['/src/api/client.ts', '/src/api/queries.ts']),
    );
    expect(outsideApi.map(([file]) => file)).toEqual(
      expect.arrayContaining(['/src/main.tsx', '/src/features/applications/ApplicationsPage.tsx']),
    );
  });

  it('el detector sí reconoce las formas de hacer una petición', () => {
    for (const code of [
      'await fetch("/x")',
      'window.fetch(url)',
      'globalThis.fetch(url)',
      'const f = fetch;',
      'new XMLHttpRequest()',
      'navigator.sendBeacon(u)',
      'new EventSource(u)',
      'new WebSocket(u)',
    ]) {
      expect(NETWORK_USE.test(stripCommentsAndStrings(code)), code).toBe(true);
    }
    expect(NETWORK_USE.test(stripCommentsAndStrings('// fetch(url)\nconst a = "fetch(x)";'))).toBe(
      false,
    );
    expect(NETWORK_USE.test(stripCommentsAndStrings('const prefetchData = 1;'))).toBe(false);
  });

  it.each(outsideApi)('%s no usa fetch, XMLHttpRequest ni otra API de red', (_file, code) => {
    expect(stripCommentsAndStrings(code)).not.toMatch(NETWORK_USE);
  });

  it.each(outsideApi)('%s no importa librerías de HTTP (axios, ky, etc.)', (_file, code) => {
    expect(code).not.toMatch(/from\s+['"](axios|ky|got|superagent|node-fetch|cross-fetch|swr)['"]/);
  });

  it.each(outsideApi)(
    '%s no importa el cliente directo: solo tipos y los hooks de queries',
    (file, code) => {
      // `./api/client` o `../api/client`: las pantallas pasan por `queries.ts`.
      // (`api/queryClient` es otro archivo y sí se puede importar: solo crea el QueryClient.)
      const importsClient = /from\s+['"][^'"]*\/api\/client(\.ts)?['"]/.test(code);
      expect(importsClient, `${file} importa src/api/client`).toBe(false);
    },
  );

  it('el único archivo de src/api/ (sin pruebas) que llama a fetch es client.ts', () => {
    const callers = insideApi
      .filter(([, code]) => NETWORK_USE.test(stripCommentsAndStrings(code)))
      .map(([file]) => file);
    expect(callers).toEqual(['/src/api/client.ts']);
  });
});
