import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage.tsx';
import '@/index.css';
import { registerServiceWorker } from '@/lib/pwa';
import { recordPageView } from '@/lib/analytics';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminPage />
  </StrictMode>,
);

registerServiceWorker();
void recordPageView();
