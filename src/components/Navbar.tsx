import React, { useState } from 'react';
import { ChevronDown, ExternalLink, LogOut, Menu, Sparkles, User, X, ArrowRight } from 'lucide-react';
import { AppView } from '../types/platform';
import { getI18n, Lang } from '../data/content';
import { useAuth } from '../hooks/useAuth';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  lang: Lang;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate, lang }) => {
  const { profile, signInWithGoogle, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const t = getI18n(lang);

  const scrollToSection = (id: string) => {
    setMobileOpen(false);
    setServicesDropdownOpen(false);
    setAccountMenuOpen(false);

    if (activeView !== 'studio') {
      onNavigate('studio');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else if (id === 'hero') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleNavigateView = (view: AppView) => {
    onNavigate(view);
    setMobileOpen(false);
    setServicesDropdownOpen(false);
    setAccountMenuOpen(false);
  };

  const servicesList = [
    { name: 'Website Design & Dev', desc: 'Custom storefronts & business portals' },
    { name: 'Video Editing & Cinema', desc: '4K color grading, VFX & sound design' },
    { name: 'Photo Editing & Retouch', desc: 'Commercial studio product & model polish' },
    { name: 'Graphic Design & Branding', desc: 'Logos, 3D typography & visual identities' },
    { name: 'Digital Growth Solutions', desc: 'SEO, multi-currency & AI automation' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E1E28]/80 bg-[#060810]/95 backdrop-blur-md w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-2 sm:gap-4 md:gap-6">
        
        {/* Left: Official Circular Logo + Brand Title + Tagline */}
        <div
          onClick={() => scrollToSection('hero')}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 group select-none min-w-0"
        >
          <div className="relative w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-full p-[1.5px] bg-gradient-to-tr from-[#D4AF37] via-[#FFF2B8] to-[#966F17] shadow-[0_0_12px_rgba(212,175,55,0.35)] group-hover:scale-105 transition-transform">
            <img
              src="/official_logo_circle.png"
              alt="Vijay Visuals Official Emblem"
              className="w-full h-full object-contain rounded-full bg-[#050811]"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-luxury font-black text-sm sm:text-base tracking-[0.14em] bg-gradient-to-r from-[#FFF3C7] via-[#ECC86A] to-[#C29729] bg-clip-text text-transparent leading-none drop-shadow-sm">
              VIJAY VISUALS
            </span>
            <span className="text-[9px] sm:text-[10px] text-[#A5A5BA] tracking-tight font-medium mt-1 truncate">
              Creative Solutions for a Digital World
            </span>
          </div>
        </div>

        {/* Center: Desktop Navigation Bar matching Reference Layout */}
        <nav className="hidden lg:flex items-center gap-1 sm:gap-2 text-xs font-medium text-[#C4C4D4]">
          <button
            type="button"
            onClick={() => scrollToSection('hero')}
            className={`px-3.5 py-1.5 rounded-full transition-all ${
              activeView === 'studio'
                ? 'bg-[#251E10]/90 text-[#ECC86A] border border-[#D4AF37]/60 shadow-[0_0_12px_rgba(212,175,55,0.25)] font-semibold'
                : 'hover:text-white'
            }`}
          >
            Home
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('about')}
            className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            About
          </button>

          {/* Services with Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setServicesDropdownOpen((prev) => !prev)}
              onMouseEnter={() => setServicesDropdownOpen(true)}
              className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors inline-flex items-center gap-1"
            >
              <span>Services</span>
              <ChevronDown className="w-3 h-3 text-[#D4AF37] opacity-80" />
            </button>

            {servicesDropdownOpen && (
              <div
                onMouseLeave={() => setServicesDropdownOpen(false)}
                className="absolute left-0 mt-1 w-64 rounded-xl border border-[#2D2D3E] bg-[#0C0F1A]/95 backdrop-blur-md p-2 shadow-2xl z-50 animate-fadeIn"
              >
                <div className="px-3 py-1.5 border-b border-[#1E1E2C] mb-1">
                  <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider">
                    Our Creative Craft
                  </span>
                </div>
                {servicesList.map((srv, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => scrollToSection('services')}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#161B2E] transition-colors group"
                  >
                    <p className="text-xs font-semibold text-white group-hover:text-[#ECC86A]">
                      {srv.name}
                    </p>
                    <p className="text-[10px] text-[#8E8EA2] group-hover:text-[#B6B6C8]">
                      {srv.desc}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => scrollToSection('portfolio')}
            className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Portfolio
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('pricing')}
            className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Packages
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('testimonials')}
            className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Testimonials
          </button>

          <button
            type="button"
            onClick={() => scrollToSection('contact')}
            className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Contact
          </button>
        </nav>

        {/* Right: "Get a Quote ->" Button + Customer Auth / Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* "Get a Quote ->" Pill Button */}
          <button
            type="button"
            onClick={() => scrollToSection('pricing')}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#D4AF37]/70 bg-gradient-to-r from-[#121624] to-[#1E1928] text-xs font-semibold text-[#F5E2AC] hover:bg-gold-gradient hover:text-[#08080C] hover:border-transparent transition-all shadow-[0_2px_8px_rgba(0,0,0,0.5)] whitespace-nowrap"
          >
            <span>Get a Quote</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:text-[#08080C]" />
          </button>

          {/* User Profile / Sign In */}
          {profile ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-full border border-[#D4AF37]/40 bg-[#12141F] text-[#F5E2AC] hover:bg-[#1A1C2C] transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="max-w-[70px] sm:max-w-[110px] truncate">{profile.name || profile.email}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-[#272736] bg-[#0E111C]/95 backdrop-blur-md p-3 shadow-2xl text-xs z-50">
                  <div className="pb-2.5 mb-2.5 border-b border-[#20202C]">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-[#8B8B9C] truncate">{profile.email}</p>
                    <p className="text-[#D4AF37] mt-1 capitalize font-mono text-[11px]">Role: {profile.role.replace('_', ' ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigateView('dashboards')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#1B1F32] text-[#D7D7E2] font-medium"
                  >
                    Open Workspace Dashboards
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-[#2A151D] text-rose-300 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.signOut}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={signInWithGoogle}
              className="px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-full bg-gold-gradient text-[#08080A] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-sm"
            >
              {t.signIn}
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden p-1.5 text-[#A3A3B5] hover:text-white rounded-lg hover:bg-[#1E1E28] transition-colors shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#1E1E28] bg-[#070A14]/98 backdrop-blur-xl px-4 py-4 space-y-2 max-h-[80vh] overflow-y-auto">
          {/* Main Anchor Links */}
          <div className="grid grid-cols-2 gap-1.5 pb-3 border-b border-[#1A1F30]">
            <button
              type="button"
              onClick={() => scrollToSection('hero')}
              className="py-2 px-3 text-left rounded-lg text-xs font-semibold bg-[#221B0F] text-[#ECC86A] border border-[#D4AF37]/40"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('about')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('services')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Services
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('portfolio')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Portfolio
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Packages
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('testimonials')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Testimonials
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="py-2 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="py-2 px-3 text-left rounded-lg text-xs font-bold text-[#F5E2AC] bg-gradient-to-r from-[#D4AF37]/20 to-[#ECC86A]/30 border border-[#D4AF37]/50"
            >
              Get a Quote →
            </button>
          </div>

          {/* Secondary Platform Portals & Tools */}
          <div className="pt-2 space-y-1">
            <p className="text-[10px] font-bold text-[#8A8A9E] uppercase tracking-wider px-3 pb-1">
              Platform Features &amp; Tools
            </p>
            <button
              type="button"
              onClick={() => handleNavigateView('demo')}
              className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              <span>Live Interactive Demo</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40">
                Interactive
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('builder')}
              className="w-full text-left py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Storefront Website Builder
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('marketplace')}
              className="w-full text-left py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Store Directory &amp; Showcase
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('dashboards')}
              className="w-full text-left py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Workspace Portals (Owner / Admin)
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('ai')}
              className="w-full text-left py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              AI Automation &amp; Multi-Lang Studio
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
