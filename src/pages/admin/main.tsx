import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage.tsx';
import '@/index.css';
import { registerServiceWorker } from '@/lib/pwa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminPage />
  </StrictMode>,
);

registerServiceWorker();
