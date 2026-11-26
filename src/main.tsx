import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Recoverable Chunk-Loading & Dynamic Import Failure Handler (Prevents blank screens on redeployments)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk')
    ) {
      const reloadKey = 'vv_chunk_reload_lock';
      const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
      const now = Date.now();
      // Controlled recovery: allow 1 reload attempt within a 30s window to prevent infinite reload loops
      if (now - lastReload > 30000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason || '');
    if (msg.includes('Failed to fetch dynamically imported module')) {
      const reloadKey = 'vv_chunk_reload_lock';
      const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
      const now = Date.now();
      if (now - lastReload > 30000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
  });
}

// Google Maps Platform Case A Tier 1 Quota Defense (Maps JS SDK auth & quota failure listener)
const dispatchMapsQuotaExceeded = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  dispatchMapsQuotaExceeded();
};

const origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  origConsoleError(...args);
  const text = args.map((a) => (typeof a === 'string' ? a : String(a ?? ''))).join(' ');
  if (text.includes('OverQuotaMapError') || text.includes('QuotaExceededError')) {
    dispatchMapsQuotaExceeded();
  }
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallbackTitle="This site is temporarily unavailable">
    <App />
  </ErrorBoundary>
);
