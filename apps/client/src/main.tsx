// Client entry point.
import '@fontsource-variable/baloo-2/wght.css';
import '@fontsource-variable/nunito/wght.css';
import './ui/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
