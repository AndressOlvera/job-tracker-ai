import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals` de Vitest, Testing Library no limpia solo: desmonta lo renderizado en cada prueba.
afterEach(() => {
  cleanup();
});

// jsdom no implementa el scroll y <ScrollRestoration> lo usa al navegar.
window.scrollTo = () => {};
