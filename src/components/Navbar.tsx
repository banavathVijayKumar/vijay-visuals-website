import React, { useState } from 'react';
import { LogOut, Menu, User, X } from 'lucide-react';
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const t = getI18n(lang);

  const links: Array<{ id: AppView; label: string }> = [
    { id: 'studio', label: t.navStudio },
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
    <header className="sticky top-0 z-40 border-b border-[#1E1E28] bg-[#08080A]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('studio')}
          className="font-luxury text-lg font-bold tracking-[0.16em] text-white hover:text-[#ECC86A] transition-colors whitespace-nowrap shrink-0 focus:outline-none"
        >
          VIJAY VISUALS
        </button>

        {/* Zone 2: 5 Concise Single-Line Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#A3A3B5]">
          {links.map((item) => {
            const active = activeView === item.id || (item.id === 'marketplace' && activeView === 'storefront');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLink(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                  active
                    ? 'text-[#ECC86A] border-[#D4AF37]'
                    : 'border-transparent hover:text-white hover:border-[#3A3A4A]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0 relative">
          {profile ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md border border-[#D4AF37]/40 bg-[#14141C] text-[#F5E2AC] hover:bg-[#1C1C26] transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="max-w-[120px] truncate">{profile.name || profile.email}</span>
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-lg border border-[#272736] bg-[#101016] p-3 shadow-xl text-xs">
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
              className="px-4 py-2 text-xs font-semibold rounded-md bg-gold-gradient text-[#08080A] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
            >
              {t.signIn}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden p-2 text-[#A3A3B5] hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#1E1E28] bg-[#0B0B10] px-6 py-4 space-y-2">
          {links.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLink(item.id)}
              className={`block w-full text-left py-2.5 text-sm font-medium ${
                activeView === item.id ? 'text-[#ECC86A]' : 'text-[#A7A7B8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
