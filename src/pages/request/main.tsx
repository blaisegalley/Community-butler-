import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RequestPage from './RequestPage.tsx';
import '@/index.css';
import { registerServiceWorker } from '@/lib/pwa';
import { recordPageView } from '@/lib/analytics';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RequestPage />
  </StrictMode>,
);

registerServiceWorker();
void recordPageView();
