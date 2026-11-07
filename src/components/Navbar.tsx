import React, { useState, useEffect } from 'react';
import { MessageCircle, Menu, X, Instagram, Mail, ArrowUpRight } from 'lucide-react';
import { CONTACT_INFO } from '../data/content';

interface NavbarProps {
  currentUser?: any;
  currentPortal: 'studio' | 'delivery' | 'admin' | 'builder' | 'shop';
  onNavigatePortal: (portal: 'studio' | 'delivery' | 'admin' | 'builder' | 'shop') => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenTracking?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentPortal,
  onNavigatePortal,
  onOpenAuth,
  onLogout,
  onOpenTracking,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Services', href: '#services', portal: 'studio' },
    { name: 'Portfolio', href: '#portfolio', portal: 'studio' },
    { name: 'Builder & Templates', href: '#builder', portal: 'builder' },
    { name: 'Pricing', href: '#pricing', portal: 'studio' },
    { name: 'About', href: '#about', portal: 'studio' },
    { name: 'Contact', href: '#contact', portal: 'studio' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string, portal: any) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (portal !== currentPortal) {
      onNavigatePortal(portal);
    }
    setTimeout(() => {
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <>
      {/* Strict 3-Zone Top Bar Contract */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#08080A]/95 backdrop-blur-md border-b border-[#26262B] py-3.5 shadow-2xl'
            : 'bg-transparent py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark (Single text element in display face) */}
          <button
            onClick={() => onNavigatePortal('studio')}
            className="flex items-center gap-3 text-lg font-bold tracking-wider text-white whitespace-nowrap shrink-0 group focus:outline-none"
          >
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] font-luxury font-black text-sm shadow-md shadow-[#D4AF37]/20 group-hover:scale-105 transition-transform duration-200">
              VV
            </span>
            <span className="font-luxury tracking-widest text-lg font-semibold group-hover:text-[#ECC86A] transition-colors">
              VIJAY VISUALS
            </span>
          </button>

          {/* Zone 2: Clean Nav Links & Portal Controls */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A3A3B2]">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href, link.portal)}
                className={`transition-colors duration-200 whitespace-nowrap shrink-0 hover:underline decoration-[#D4AF37]/40 underline-offset-8 ${
                  currentPortal === link.portal && link.portal !== 'studio'
                    ? 'text-[#DFBA5A] font-bold'
                    : 'hover:text-[#F3E5AB]'
                }`}
              >
                {link.name}
              </a>
            ))}

            {/* Quick Portals Links */}
            <button
              onClick={() => onNavigatePortal('shop')}
              className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                currentPortal === 'shop'
                  ? 'bg-[#2B2312] text-[#DFBA5A] border border-[#DFBA5A]/40'
                  : 'text-[#848496] hover:text-[#DFBA5A]'
              }`}
            >
              <span>Shop Console</span>
            </button>

            <button
              onClick={() => onNavigatePortal('delivery')}
              className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                currentPortal === 'delivery'
                  ? 'bg-[#18261A] text-[#25D366] border border-[#25D366]/40'
                  : 'text-[#848496] hover:text-[#25D366]'
              }`}
            >
              <span>Delivery Fleet</span>
            </button>

            <button
              onClick={() => onNavigatePortal('admin')}
              className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
                currentPortal === 'admin'
                  ? 'bg-[#292210] text-[#DFBA5A] border border-[#DFBA5A]/40'
                  : 'text-[#848496] hover:text-[#DFBA5A]'
              }`}
            >
              <span>Admin</span>
            </button>

            {onOpenTracking && (
              <button
                onClick={onOpenTracking}
                className="text-xs font-semibold px-2 py-1 rounded text-[#848496] hover:text-white transition-colors whitespace-nowrap"
              >
                Track Order
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Actions (User / Login / WhatsApp) */}
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#DFBA5A] font-mono hidden sm:inline truncate max-w-[120px]">
                  {currentUser.full_name.split(' ')[0]}
                </span>
                <button
                  onClick={onLogout}
                  className="px-2.5 py-1.5 text-xs text-[#FF8585] bg-[#1E1418] border border-[#3E2024] rounded hover:bg-[#28181D]"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="hidden sm:inline-flex px-3 py-1.5 text-xs font-semibold text-[#D1D1DE] bg-[#14141E] hover:bg-[#1A1A26] border border-[#262636] rounded-md transition-colors"
              >
                Sign In
              </button>
            )}

            <a
              href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to inquire about your services and website builder at Vijay Visuals.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold tracking-wider uppercase text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all duration-200 shadow-md shadow-[#D4AF37]/15 whitespace-nowrap shrink-0 hover:scale-[1.02] active:scale-[0.98]"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>

            {/* Mobile hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Navigation Menu'}
              className="md:hidden p-2 text-[#A3A3B2] hover:text-white rounded-md hover:bg-[#1A1A22] transition-colors focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-[#08080A]/95 backdrop-blur-xl border-b border-[#26262B] flex flex-col justify-between p-6 pt-20 animate-in fade-in duration-200">
          <div className="flex flex-col space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#1E1E26]">
              <span className="font-luxury font-bold text-lg text-gold-gradient tracking-widest">
                VIJAY VISUALS
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-[#A3A3B2] hover:text-white"
                aria-label="Close Menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex flex-col space-y-3 pt-2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href, link.portal)}
                  className="text-base font-medium text-[#D1D1DE] hover:text-[#ECC86A] transition-colors py-1 flex items-center justify-between border-b border-[#1A1A22]/50"
                >
                  <span>{link.name}</span>
                  <ArrowUpRight className="w-4 h-4 text-[#7A7A88]" />
                </a>
              ))}

              <div className="pt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigatePortal('delivery');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-[#18261A] text-[#25D366] text-xs font-semibold border border-[#25D366]/40 text-center"
                >
                  Delivery Fleet Portal
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigatePortal('admin');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-[#292210] text-[#DFBA5A] text-xs font-semibold border border-[#DFBA5A]/40 text-center"
                >
                  Admin Console
                </button>
              </div>
            </nav>
          </div>

          <div className="pt-6 border-t border-[#1E1E26] flex flex-col gap-3">
            {currentUser ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#141420] border border-[#242436]">
                <span className="text-xs text-white font-semibold">{currentUser.full_name}</span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="text-xs text-[#FF8585] underline"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full py-2.5 rounded-lg bg-[#181824] border border-[#2B2B3C] text-xs font-semibold text-white"
              >
                Sign In (Customer / Shop Owner)
              </button>
            )}

            <a
              href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to inquire about your services at Vijay Visuals.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] rounded-md shadow-lg"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chat on WhatsApp (+91 93813 62201)</span>
            </a>

            <div className="flex items-center justify-center gap-6 pt-2 text-xs text-[#828292]">
              <a
                href={CONTACT_INFO.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-[#ECC86A] transition-colors"
              >
                <Instagram className="w-4 h-4 text-[#D4AF37]" />
                <span>@{CONTACT_INFO.instagram}</span>
              </a>
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="flex items-center gap-1.5 hover:text-[#ECC86A] transition-colors"
              >
                <Mail className="w-4 h-4 text-[#D4AF37]" />
                <span>{CONTACT_INFO.email}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
