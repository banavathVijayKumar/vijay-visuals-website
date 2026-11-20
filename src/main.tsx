import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

createRoot(document.getElementById('root')!).render(<App />);
