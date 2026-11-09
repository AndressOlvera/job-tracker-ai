import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals` de Vitest, Testing Library no limpia solo: desmonta lo renderizado en cada prueba.
afterEach(() => {
  cleanup();
});

// jsdom no implementa el scroll y <ScrollRestoration> lo usa al navegar.
// Las pruebas con `@vitest-environment node` (p. ej. vite.config.test.ts) no tienen `window`.
if (typeof window !== 'undefined') window.scrollTo = () => {};
