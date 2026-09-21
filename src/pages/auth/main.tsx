import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AuthPage from './AuthPage.tsx';
import '@/index.css';
import { registerServiceWorker } from '@/lib/pwa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthPage />
  </StrictMode>,
);

registerServiceWorker();
