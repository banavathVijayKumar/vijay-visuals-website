import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex items-center gap-3 bg-[#12121A] border border-[#D4AF37]/50 text-white px-4 py-3 rounded-lg shadow-2xl shadow-[#D4AF37]/10 animate-in fade-in slide-in-from-top-2 duration-200 max-w-sm">
      <div className="w-5 h-5 rounded-full bg-[#DFBA5A] text-[#0A0A0E] flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      </div>
      <p className="text-xs text-[#E1E1EB] leading-snug flex-1">
        {message}
      </p>
      <button
        onClick={onClose}
        className="text-[#777789] hover:text-white p-1"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
