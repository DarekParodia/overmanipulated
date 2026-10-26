// Client entry point.
// First import on purpose: the page's error listeners go in before any other module evaluates.
import './errors/install-page-errors.ts';
import '@fontsource-variable/baloo-2/wght.css';
import '@fontsource-variable/nunito/wght.css';
import './ui/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './errors/ErrorBoundary.tsx';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
