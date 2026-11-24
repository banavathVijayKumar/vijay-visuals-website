import React, { useState } from 'react';
import { LogOut, Menu, Sparkles, User, X } from 'lucide-react';
import { AppView } from '../types/platform';
import { getI18n, Lang } from '../data/content';
import { useAuth } from '../hooks/useAuth';
import { VijayVisualsLogo } from './VijayVisualsLogo';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  lang: Lang;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate, lang }) => {
  const { profile, signInWithGoogle, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const t = getI18n(lang);

  const links: Array<{ id: AppView; label: string; badge?: string }> = [
    { id: 'studio', label: t.navStudio },
    { id: 'demo', label: 'Live Demo', badge: 'Interactive' },
    { id: 'builder', label: t.navBuilder },
    { id: 'marketplace', label: t.navMarketplace },
    { id: 'dashboards', label: t.navDashboards },
    { id: 'ai', label: t.navAi },
  ];

  const handleLink = (view: AppView) => {
    onNavigate(view);
    setMobileOpen(false);
    setAccountMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#1E1E28] bg-[#08080A]/95 backdrop-blur-md w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4 md:gap-8">
        {/* Zone 1: Premium Vijay Visuals Brand Logo */}
        <div className="shrink-0 min-w-0">
          <VijayVisualsLogo
            variant="compact"
            size="sm"
            mode="dark"
            onClick={() => handleLink('studio')}
            className="hover:opacity-95 transition-opacity"
          />
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A3A3B5]">
          {links.map((item) => {
            const active =
              activeView === item.id ||
              (item.id === 'marketplace' && activeView === 'storefront');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLink(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 inline-flex items-center gap-1.5 ${
                  active
                    ? 'text-[#ECC86A] border-[#D4AF37]'
                    : 'border-transparent hover:text-white hover:border-[#3A3A4A]'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 tracking-tight">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 relative">
          {profile ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-md border border-[#D4AF37]/40 bg-[#14141C] text-[#F5E2AC] hover:bg-[#1C1C26] transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="max-w-[70px] sm:max-w-[120px] truncate">{profile.name || profile.email}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-lg border border-[#272736] bg-[#101016] p-3 shadow-xl text-xs z-50">
                  <div className="pb-2.5 mb-2.5 border-b border-[#20202C]">
                    <p className="font-semibold text-white truncate">{profile.name}</p>
                    <p className="text-[#8B8B9C] truncate">{profile.email}</p>
                    <p className="text-[#D4AF37] mt-1 capitalize">Role: {profile.role.replace('_', ' ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLink('dashboards')}
                    className="w-full text-left px-2.5 py-2 rounded hover:bg-[#1A1A24] text-[#D7D7E2]"
                  >
                    Open Workspace Dashboards
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setAccountMenuOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded hover:bg-[#1A1A24] text-rose-300 mt-1"
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
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-md bg-gold-gradient text-[#08080A] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
            >
              {t.signIn}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden p-1.5 sm:p-2 text-[#A3A3B5] hover:text-white rounded-md hover:bg-[#1E1E28] transition-colors shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#1E1E28] bg-[#0B0B10] px-4 sm:px-6 py-4 space-y-2">
          {links.map((item) => {
            const active =
              activeView === item.id ||
              (item.id === 'marketplace' && activeView === 'storefront');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLink(item.id)}
                className={`w-full flex items-center justify-between py-2.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  active ? 'bg-[#161622] text-[#ECC86A] font-semibold' : 'text-[#A7A7B8] hover:bg-[#12121A] hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 tracking-tight">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
