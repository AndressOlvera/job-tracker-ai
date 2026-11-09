// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createServer,
  preview,
  resolveConfig,
  type ConfigEnv,
  type ProxyOptions,
  type UserConfig,
} from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import viteConfig from './vite.config.ts';

// Pruebas del proxy de `/api` (issue #11, ADR-005): el navegador solo habla con Vite y Vite
// reenvía `/api` a `flask run`, que por defecto escucha en http://127.0.0.1:5000.

const FRONTEND_DIR = fileURLToPath(new URL('.', import.meta.url));
const CONFIG_FILE = path.join(FRONTEND_DIR, 'vite.config.ts');
const DEV: ConfigEnv = { mode: 'development', command: 'serve' };

async function loadConfig(env: ConfigEnv): Promise<UserConfig> {
  return typeof viteConfig === 'function' ? viteConfig(env) : viteConfig;
}

function apiProxy(proxy: Record<string, string | ProxyOptions> | undefined): ProxyOptions {
  const entry = proxy?.['/api'];
  return typeof entry === 'string' ? { target: entry } : (entry ?? {});
}

/** Carpeta temporal, vacía salvo por los archivos que se pasen. */
function makeTempDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vite-env-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const tempDirs: string[] = [];

function useEnvDir(files?: Record<string, string>): void {
  const dir = makeTempDir(files);
  tempDirs.push(dir);
  // `vite.config.ts` lee los `.env` de `process.cwd()`. Apuntarlo a una carpeta propia evita
  // que un `.env.local` de quien corre las pruebas cambie el resultado.
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('vite.config.ts → proxy de /api', () => {
  it('por defecto manda /api al puerto 5000 de `flask run`', async () => {
    useEnvDir();
    vi.stubEnv('API_PROXY_TARGET', undefined);

    const proxy = apiProxy((await loadConfig(DEV)).server?.proxy);

    expect(proxy.target).toBe('http://127.0.0.1:5000');
  });

  it('solo reenvía /api y sin reescribir la ruta', async () => {
    useEnvDir();
    vi.stubEnv('API_PROXY_TARGET', undefined);

    const config = await loadConfig(DEV);

    expect(Object.keys(config.server?.proxy ?? {})).toEqual(['/api']);
    expect(apiProxy(config.server?.proxy).rewrite).toBeUndefined();
  });

  it('API_PROXY_TARGET cambia el destino (p. ej. el servicio `api` de Docker Compose)', async () => {
    useEnvDir();
    vi.stubEnv('API_PROXY_TARGET', 'http://api:5000');

    const proxy = apiProxy((await loadConfig(DEV)).server?.proxy);

    expect(proxy.target).toBe('http://api:5000');
  });

  it('un API_PROXY_TARGET vacío usa el destino por defecto', async () => {
    useEnvDir();
    vi.stubEnv('API_PROXY_TARGET', '');

    const proxy = apiProxy((await loadConfig(DEV)).server?.proxy);

    expect(proxy.target).toBe('http://127.0.0.1:5000');
  });

  it('API_PROXY_TARGET también se lee de `.env.local`, como dice el README', async () => {
    useEnvDir({ '.env.local': 'API_PROXY_TARGET=http://localhost:8000\n' });
    vi.stubEnv('API_PROXY_TARGET', undefined);

    const proxy = apiProxy((await loadConfig(DEV)).server?.proxy);

    expect(proxy.target).toBe('http://localhost:8000');
  });

  it('`vite preview` usa el mismo proxy', async () => {
    useEnvDir();
    vi.stubEnv('API_PROXY_TARGET', undefined);

    // Así resuelve Vite la configuración al correr `vite preview`.
    const resolved = await resolveConfig(
      { configFile: CONFIG_FILE, root: FRONTEND_DIR, logLevel: 'silent' },
      'serve',
      'production',
      'production',
      true,
    );

    expect(apiProxy(resolved.preview.proxy).target).toBe('http://127.0.0.1:5000');
    expect(resolved.preview.proxy).toEqual(resolved.server.proxy);
  });
});

/** API falsa que hace de `flask run`: anota cada petición y responde un 404 como el de la API. */
interface FakeApi {
  server: Server;
  url: string;
  requests: Pick<IncomingMessage, 'method' | 'url'>[];
}

async function startFakeApi(): Promise<FakeApi> {
  const requests: FakeApi['requests'] = [];
  const server = createHttpServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'not_found', message: 'No existe.' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, requests };
}

function addressOf(server: Server | null | undefined): string {
  const { port } = server?.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('proxy de /api con servidores reales', () => {
  let api: FakeApi;
  // Caché propia: si no, estas pruebas reescriben node_modules/.vite y el siguiente
  // `npm run dev` vuelve a optimizar las dependencias.
  const cacheDir = makeTempDir();

  beforeAll(async () => {
    api = await startFakeApi();
  });

  afterAll(async () => {
    await new Promise((resolve) => api.server.close(resolve));
    rmSync(cacheDir, { recursive: true, force: true });
  });

  afterEach(() => {
    api.requests.length = 0;
  });

  const inline = {
    configFile: CONFIG_FILE,
    root: FRONTEND_DIR,
    cacheDir,
    logLevel: 'silent' as const,
    clearScreen: false,
  };

  it('`vite` reenvía /api con la misma ruta y devuelve la respuesta de la API tal cual', async () => {
    vi.stubEnv('API_PROXY_TARGET', api.url);
    const vite = await createServer({
      ...inline,
      server: { host: '127.0.0.1', port: 0, ws: false },
      optimizeDeps: { noDiscovery: true },
    });
    await vite.listen();

    try {
      const base = addressOf(vite.httpServer as Server);
      const res = await fetch(`${base}/api/v1/applications?status=interview&page=2`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No existe.' } });
      expect(api.requests).toEqual([
        { method: 'DELETE', url: '/api/v1/applications?status=interview&page=2' },
      ]);
    } finally {
      await vite.close();
    }
  });

  it('`vite` no manda a la API las rutas de la app (sirve index.html)', async () => {
    vi.stubEnv('API_PROXY_TARGET', api.url);
    const vite = await createServer({
      ...inline,
      server: { host: '127.0.0.1', port: 0, ws: false },
      optimizeDeps: { noDiscovery: true },
    });
    await vite.listen();

    try {
      const base = addressOf(vite.httpServer as Server);
      for (const route of ['/', '/applications/new', '/applications/5/edit', '/stats']) {
        const res = await fetch(`${base}${route}`, { headers: { Accept: 'text/html' } });
        expect(res.status, route).toBe(200);
        expect(await res.text(), route).toContain('<div id="root"></div>');
      }
      expect(api.requests).toEqual([]);
    } finally {
      await vite.close();
    }
  });

  it('`vite preview` reenvía /api con la misma ruta', async () => {
    vi.stubEnv('API_PROXY_TARGET', api.url);
    const server = await preview({
      ...inline,
      preview: { host: '127.0.0.1', port: 0 },
    });

    try {
      const base = addressOf(server.httpServer as Server);
      const res = await fetch(`${base}/api/v1/stats`);

      expect(res.status).toBe(404);
      expect(api.requests).toEqual([{ method: 'GET', url: '/api/v1/stats' }]);
    } finally {
      await server.close();
    }
  });
});
