// ============================================================================
// VIJAY VISUALS — PROFESSIONAL 404 NOT FOUND VIEW
// - Prevents blank screen when accessing broken, unknown, or expired routes.
// - Provides one-click navigation back to Home or Marketplace.
// - Displays official agency support contact: +91 9381362201 / vk66278@gmail.com.
// ============================================================================

import React from 'react';
import { Compass, Home, Phone, Mail, MessageCircle, Store } from 'lucide-react';

interface NotFoundViewProps {
  onGoHome?: () => void;
  onGoMarketplace?: () => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onGoHome, onGoMarketplace }) => {
  const handleHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const handleMarketplace = () => {
    if (onGoMarketplace) {
      onGoMarketplace();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/marketplace';
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#111119] border border-[#27273A] rounded-2xl p-8 text-center space-y-6 shadow-2xl">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
          <Compass className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded border border-amber-500/30">
            ERROR 404 · PAGE NOT FOUND
          </span>
          <h1 className="text-2xl font-extrabold text-white">Looking for a Digital Storefront?</h1>
          <p className="text-xs text-[#A0A0B8] leading-relaxed">
            The page, storefront, or proposal link you requested could not be located.
            It may have been moved, updated, or the address might be slightly mistyped.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleHome}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ECC86A] via-[#D4AF37] to-[#B89628] text-black text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Home</span>
          </button>
          <button
            type="button"
            onClick={handleMarketplace}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A26] border border-[#2C2C3E] text-white text-xs font-semibold hover:bg-[#252536] hover:border-[#D4AF37]/50 active:scale-95 transition-all"
          >
            <Store className="w-3.5 h-3.5 text-amber-300" />
            <span>Explore Stores</span>
          </button>
        </div>

        <div className="border-t border-[#1F1F2E] pt-4 text-[11px] text-[#8E8EA2] space-y-2">
          <div className="font-semibold text-white">VIJAY VISUALS Client Concierge</div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <a
              href="tel:+919381362201"
              className="inline-flex items-center gap-1.5 text-white hover:text-amber-300 transition-colors"
            >
              <Phone className="w-3 h-3 text-amber-400" />
              <span>+91 9381362201</span>
            </a>
            <span className="text-[#3A3A4E]">·</span>
            <a
              href="https://wa.me/919381362201"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-white hover:text-emerald-400 transition-colors"
            >
              <MessageCircle className="w-3 h-3 text-emerald-400" />
              <span>WhatsApp</span>
            </a>
            <span className="text-[#3A3A4E]">·</span>
            <a
              href="mailto:vk66278@gmail.com"
              className="inline-flex items-center gap-1.5 text-white hover:text-amber-300 transition-colors"
            >
              <Mail className="w-3 h-3 text-amber-400" />
              <span>vk66278@gmail.com</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
