import React, { useState } from 'react';
import { ExternalLink, LogOut, Menu, Sparkles, User, X, ArrowRight } from 'lucide-react';
import { AppView } from '../types/platform';
import { getI18n, Lang } from '../data/content';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { getScrollBehavior } from '../lib/motion';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  lang: Lang;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate, lang }) => {
  const { profile, signInWithGoogle, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const t = getI18n(lang);

  const handleChangePassword = async () => {
    setPasswordMessage('');
    if (newPassword.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      return;
    }
    const client = getSupabaseClient();
    if (!client || !profile?.email) {
      setPasswordMessage('Account service is unavailable. Please try again later.');
      return;
    }
    setPasswordBusy(true);
    try {
      const { error: reauthError } = await client.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (reauthError) {
        setPasswordMessage('Current password is incorrect.');
        return;
      }
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) {
        setPasswordMessage('Could not update the password. Please try again.');
        return;
      }
      await client.auth.signOut({ scope: 'others' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password updated. Other active sessions were signed out.');
    } catch {
      setPasswordMessage('Could not update the password. Please try again.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const scrollToSection = (id: string) => {
    setMobileOpen(false);
    setAccountMenuOpen(false);

    if (activeView !== 'studio') {
      onNavigate('studio');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: getScrollBehavior() });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: getScrollBehavior() });
      } else if (id === 'hero') {
        window.scrollTo({ top: 0, behavior: getScrollBehavior() });
      }
    }
  };

  const handleNavigateView = (view: AppView) => {
    onNavigate(view);
    setMobileOpen(false);
    setAccountMenuOpen(false);
  };

  const handleSectionClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    scrollToSection(id);
  };

  const handleViewClick = (event: React.MouseEvent<HTMLAnchorElement>, view: AppView) => {
    event.preventDefault();
    handleNavigateView(view);
  };

  const viewHref = (view: AppView) => (view === 'studio' ? '/' : `/${view}`);

  return (
    <header className="sticky top-0 z-50 border-b border-[#1E1E28]/80 bg-[#060810]/95 backdrop-blur-md w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-2 sm:gap-4 md:gap-6">
        
        {/* Left: Official Circular Logo + Brand Title + Tagline */}
        <a
          href="/"
          onClick={(event) => handleSectionClick(event, 'hero')}
          aria-label="Vijay Visuals — home"
          className="flex min-h-11 items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 group select-none min-w-0"
        >
          <div className="relative w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-full p-[1.5px] bg-gradient-to-tr from-[#D4AF37] via-[#FFF2B8] to-[#966F17] shadow-[0_0_12px_rgba(212,175,55,0.35)] group-hover:scale-105 transition-transform">
            <img
              src="/official_logo_circle.png"
              alt="Vijay Visuals Official Emblem"
              width={1024}
              height={1024}
              loading="eager"
              decoding="async"
              className="w-full h-full object-contain rounded-full bg-[#050811]"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-luxury font-black text-sm sm:text-base tracking-[0.14em] bg-gradient-to-r from-[#FFF3C7] via-[#ECC86A] to-[#C29729] bg-clip-text text-transparent leading-none drop-shadow-sm">
              VIJAY VISUALS
            </span>
          </div>
        </a>

        {/* Center: Desktop Navigation Bar matching Reference Layout */}
        <nav className="hidden lg:flex items-center gap-1 sm:gap-2 text-xs font-medium text-[#C4C4D4]">
          <a
            href="/#hero"
            onClick={(event) => handleSectionClick(event, 'hero')}
            className={`inline-flex min-h-11 items-center px-3.5 py-1.5 rounded-full transition-all ${
              activeView === 'studio'
                ? 'bg-[#251E10]/90 text-[#ECC86A] border border-[#D4AF37]/60 shadow-[0_0_12px_rgba(212,175,55,0.25)] font-semibold'
                : 'hover:text-white'
            }`}
          >
            Home
          </a>

          <a
            href="/#about"
            onClick={(event) => handleSectionClick(event, 'about')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            About
          </a>

          {/* Direct link to the five-card Our Platform section */}
          <a
            href="/#services"
            onClick={(event) => handleSectionClick(event, 'services')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Our Platform
          </a>

          <a
            href="/#portfolio"
            onClick={(event) => handleSectionClick(event, 'portfolio')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Portfolio
          </a>

          <a
            href="/#pricing"
            onClick={(event) => handleSectionClick(event, 'pricing')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Packages
          </a>

          <a
            href={viewHref('demo-builder')}
            onClick={(event) => handleViewClick(event, 'demo-builder')}
            className={`inline-flex min-h-11 items-center px-3 py-1.5 rounded-full transition-all ${
              activeView === 'demo-builder'
                ? 'bg-[#251E10]/90 text-[#ECC86A] border border-[#D4AF37]/60 font-semibold'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            Demo Business
          </a>

          <a
            href="/#testimonials"
            onClick={(event) => handleSectionClick(event, 'testimonials')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Sample Testimonials
          </a>

          <a
            href="/#contact"
            onClick={(event) => handleSectionClick(event, 'contact')}
            className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Contact
          </a>
        </nav>

        {/* Right: "Get a Quote ->" Button + Customer Auth / Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* "Get a Quote ->" Pill Button */}
          <button
            type="button"
            onClick={() => scrollToSection('pricing')}
            className="hidden sm:inline-flex min-h-11 items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#D4AF37]/70 bg-gradient-to-r from-[#121624] to-[#1E1928] text-xs font-semibold text-[#F5E2AC] hover:bg-gold-gradient hover:text-[#08080C] hover:border-transparent transition-all shadow-[0_2px_8px_rgba(0,0,0,0.5)] whitespace-nowrap"
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
                    onClick={() => {
                      setPasswordMessage('');
                      setChangePasswordOpen((prev) => !prev);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#1B1F32] text-[#D7D7E2] font-medium"
                  >
                    Change Password
                  </button>
                  {changePasswordOpen && (
                    <div className="mt-1 rounded-lg border border-[#272736] bg-[#12141F] p-2.5 space-y-2">
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder="Current password"
                        className="w-full rounded-md border border-[#2A2A3A] bg-[#0E111C] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#D4AF37]"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New password (8+ characters)"
                        className="w-full rounded-md border border-[#2A2A3A] bg-[#0E111C] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#D4AF37]"
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirm new password"
                        className="w-full rounded-md border border-[#2A2A3A] bg-[#0E111C] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#D4AF37]"
                      />
                      {passwordMessage && (
                        <p className="text-[11px] text-[#F5E2AC]">{passwordMessage}</p>
                      )}
                      <button
                        type="button"
                        disabled={passwordBusy}
                        onClick={handleChangePassword}
                        className="w-full rounded-md bg-gold-gradient py-1.5 text-[11px] font-semibold text-[#08080A] disabled:opacity-60"
                      >
                        {passwordBusy ? 'Updating…' : 'Update Password'}
                      </button>
                    </div>
                  )}
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
              className="min-h-11 px-4 sm:px-3.5 py-1.5 text-xs font-semibold rounded-full bg-gold-gradient text-[#08080A] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-sm"
            >
              {t.signIn}
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="lg:hidden inline-flex h-11 w-11 items-center justify-center text-[#A3A3B5] hover:text-white rounded-lg hover:bg-[#1E1E28] transition-colors shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#1E1E28] bg-[#070A14]/98 backdrop-blur-xl px-4 py-4 space-y-2 max-h-[80vh] overflow-y-auto">
          {/* Primary quick links — Amazon-style horizontal chips, no bottom nav needed. */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3 border-b border-[#1A1F30]">
            <button
              type="button"
              onClick={() => scrollToSection('hero')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-xs font-semibold bg-[#221B0F] text-[#ECC86A] border border-[#D4AF37]/40"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('marketplace')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-xs font-medium text-[#C4C4D4] bg-[#111522] border border-[#222A3D]"
            >
              Categories / Templates
            </button>
            <button
              type="button"
              onClick={() => handleNavigateView('demo-builder')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-xs font-semibold text-[#ECC86A] bg-[#221B0F] border border-[#D4AF37]/40"
            >
              Demo Business
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('services')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-xs font-medium text-[#C4C4D4] bg-[#111522] border border-[#222A3D]"
            >
              Our Platform
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-xs font-medium text-[#C4C4D4] bg-[#111522] border border-[#222A3D]"
            >
              Packages
            </button>
            {profile ? (
              <button
                type="button"
                onClick={() => handleNavigateView('dashboards')}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium text-[#C4C4D4] bg-[#111522] border border-[#222A3D]"
              >
                <User className="h-3.5 w-3.5 text-[#D4AF37]" />
                Account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  void signInWithGoogle();
                }}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium text-[#C4C4D4] bg-[#111522] border border-[#222A3D]"
              >
                <User className="h-3.5 w-3.5 text-[#D4AF37]" />
                Account / Sign In
              </button>
            )}
          </div>

          {/* Secondary anchor links */}
          <div className="grid grid-cols-2 gap-1.5 pb-3 border-b border-[#1A1F30]">
            <button
              type="button"
              onClick={() => scrollToSection('about')}
              className="min-h-11 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('portfolio')}
              className="min-h-11 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Sample Work
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('testimonials')}
              className="min-h-11 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Sample Testimonials
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact')}
              className="min-h-11 px-3 text-left rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Contact
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('pricing')}
              className="col-span-2 min-h-11 px-3 text-left rounded-lg text-xs font-bold text-[#F5E2AC] bg-gradient-to-r from-[#D4AF37]/20 to-[#ECC86A]/30 border border-[#D4AF37]/50"
            >
              Get a Quote →
            </button>
          </div>

          {/* Secondary Platform Portals & Tools */}
          <div className="pt-2 space-y-1">
            <p className="text-[10px] font-bold text-[#8A8A9E] uppercase tracking-wider px-3 pb-1">
              Platform Features &amp; Tools
            </p>
            <a
              href={viewHref('demo-builder')}
              onClick={(event) => handleViewClick(event, 'demo-builder')}
              className="w-full flex items-center justify-between min-h-11 py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              <span>Demo Business Builder</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40">
                New
              </span>
            </a>
            <a
              href={viewHref('demo')}
              onClick={(event) => handleViewClick(event, 'demo')}
              className="w-full flex items-center justify-between min-h-11 py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              <span>Live Interactive Demo</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40">
                Interactive
              </span>
            </a>
            <a
              href={viewHref('builder')}
              onClick={(event) => handleViewClick(event, 'builder')}
              className="inline-flex min-h-11 w-full items-center py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Storefront Website Builder
            </a>
            <a
              href={viewHref('marketplace')}
              onClick={(event) => handleViewClick(event, 'marketplace')}
              className="inline-flex min-h-11 w-full items-center py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Store Directory &amp; Showcase
            </a>
            <a
              href={viewHref('dashboards')}
              onClick={(event) => handleViewClick(event, 'dashboards')}
              className="inline-flex min-h-11 w-full items-center py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              Workspace Portals (Owner / Admin)
            </a>
            <a
              href={viewHref('ai')}
              onClick={(event) => handleViewClick(event, 'ai')}
              className="inline-flex min-h-11 w-full items-center py-2 px-3 rounded-lg text-xs font-medium text-[#C4C4D4] hover:bg-[#151928] hover:text-white"
            >
              AI Automation &amp; Multi-Lang Studio
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
