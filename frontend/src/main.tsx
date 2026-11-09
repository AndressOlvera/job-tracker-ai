import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import './styles/global.css';
import { createQueryClient } from './api/queryClient';
import { App } from './App';
import { routes } from './routes';

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento #root en index.html.');

createRoot(rootElement).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} />
  </StrictMode>,
);
