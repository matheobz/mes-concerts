import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
