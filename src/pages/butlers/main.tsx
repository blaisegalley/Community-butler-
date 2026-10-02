import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ButlersPage from './ButlersPage.tsx';
import '@/index.css';
import { registerServiceWorker } from '@/lib/pwa';
import { recordPageView } from '@/lib/analytics';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ButlersPage />
  </StrictMode>,
);

registerServiceWorker();
void recordPageView();
