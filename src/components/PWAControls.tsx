import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ appLabel?: string; compact?: boolean }> = ({
  appLabel = 'Install Web App',
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-11 items-center gap-2 border border-[#D4AF37]/40 bg-[#14141B] text-[#ECC86A] hover:bg-[#1C1C26] transition-colors rounded-md font-medium whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isIOS ? 'Install on iOS' : appLabel}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-[#101016] border border-[#272734] p-6 text-[#E8E8ED]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[#ECC86A] font-semibold">
                <Smartphone className="w-4 h-4" />
                <span>Install Branded Progressive Web App</span>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex h-11 w-11 items-center justify-center text-[#8B8B9C] hover:text-white"
                aria-label="Close install instructions"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#A7A7B8] leading-relaxed mb-4">
              Progressive Web Apps install directly from your mobile or desktop browser with offline app-shell caching. Live catalog data, orders and checkout require a connection. This is a browser-based Web App, not a Google Play Store native application.
            </p>
            <div className="space-y-2.5 text-xs text-[#D1D1DC] bg-[#0B0B10] border border-[#22222E] rounded-lg p-4">
              <p>
                <strong className="text-white">Android Chrome / Edge:</strong> Open the browser menu (three dots) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </p>
              <p>
                <strong className="text-white">iPhone / iPad Safari:</strong> Tap the <strong>Share</strong> icon in the toolbar, scroll down, and tap <strong>Add to Home Screen</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full py-2.5 rounded-md bg-[#D4AF37] text-[#08080A] font-semibold text-xs hover:bg-[#ECC86A] transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-amber-500/40 bg-[#1B160A] px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg sm:max-w-sm"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Offline Mode — app pages are cached. Live data, checkout and orders need a connection.</span>
    </div>
  );
};
