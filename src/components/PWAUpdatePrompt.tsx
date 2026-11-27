import React, { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, X } from 'lucide-react';

export const PWAUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<ReturnType<typeof registerSW> | null>(null);

  useEffect(() => {
    let disposed = false;
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (!disposed) setNeedRefresh(true);
      },
    });
    return () => {
      disposed = true;
      updateRef.current = null;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-4 right-4 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-[#D4AF37]/50 bg-[#14141D]/95 px-4 py-3 text-xs text-[#F5E4B2] shadow-2xl backdrop-blur-md sm:left-auto sm:right-5"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-[#ECC86A]" aria-hidden="true" />
      <span className="min-w-0 flex-1">A new version is ready. Reload when you are ready.</span>
      <button
        type="button"
        onClick={() => {
          void updateRef.current?.(true);
          setNeedRefresh(false);
        }}
        className="min-h-11 shrink-0 rounded-md bg-[#D4AF37] px-3 font-semibold text-[#08080A] hover:bg-[#ECC86A]"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update notice"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#9A9AAC] hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
