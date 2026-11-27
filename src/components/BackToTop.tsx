import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export const BackToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className="fixed right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D4AF37]/55 bg-[#12121B]/95 text-[#ECC86A] shadow-lg backdrop-blur-md transition-colors hover:bg-[#D4AF37] hover:text-[#08080A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ECC86A]"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};
