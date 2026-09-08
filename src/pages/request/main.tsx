import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RequestPage from './RequestPage.tsx';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RequestPage />
  </StrictMode>,
);
