import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// `flask run` escucha aquí por defecto. En Docker se cambia con API_PROXY_TARGET (p. ej. http://api:5000).
const DEFAULT_API_TARGET = 'http://127.0.0.1:5000';

export default defineConfig(({ mode }) => {
  // Prefijo vacío: lee API_PROXY_TARGET del entorno o de un .env sin exponerla al navegador.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || DEFAULT_API_TARGET;

  return {
    plugins: [react()],
    server: {
      // ADR-005: el navegador solo habla con Vite y Vite reenvía /api a Flask.
      // Así frontend y API comparten origen y no hace falta configurar CORS.
      // `vite preview` usa este mismo proxy.
      proxy: {
        '/api': { target: apiTarget },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Cada prueba empieza sin mocks ni globals (como fetch) de la anterior.
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: './coverage',
        // Incluye también los archivos que ninguna prueba toca, para que la cifra sea honesta.
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/**/*.d.ts', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
      },
    },
  };
});
