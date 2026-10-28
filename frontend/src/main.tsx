import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { registerServiceWorker } from './lib/push';
import { startFontScale } from './lib/ui-scale';

async function start() {
  startFontScale();
  // Development only: ?mock=1 swaps the network for sample data (see dev/mock-api.ts). A normal production build
  // leaves it out entirely; only a build made with VITE_MOCK=1 (for taking screenshots) contains it.
  if (import.meta.env.DEV || import.meta.env.VITE_MOCK === '1') {
    const { mockRequested, enableMock } = await import('./dev/mock-api');
    if (mockRequested()) enableMock();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
registerServiceWorker();
void start();
