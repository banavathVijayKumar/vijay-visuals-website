/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { ServicesSection } from './components/ServicesSection';
import { PortfolioSection } from './components/PortfolioSection';
import { CostCalculator } from './components/CostCalculator';
import { PricingSection } from './components/PricingSection';
import { AboutSection } from './components/AboutSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { FloatingWhatsApp } from './components/FloatingWhatsApp';
import { Toast } from './components/Toast';

// Multi-Tenant Builder & Logistics Modules
import { DeliveryLogin } from './components/delivery/DeliveryLogin';
import { DeliveryDashboard } from './components/delivery/DeliveryDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { WebsiteBuilder } from './components/builder/WebsiteBuilder';
import { ShopOwnerDashboard } from './components/shop/ShopOwnerDashboard';
import { PublicStorefront } from './components/storefront/PublicStorefront';
import { OrderTrackingModal } from './components/tracking/OrderTrackingModal';
import { LegalModal } from './components/legal/LegalModals';
import { AuthModal } from './components/auth/AuthModal';
import {
  authService,
  UserProfile,
  subscribeToStore,
  supabase,
  isSupabaseConfigured,
} from './lib/supabase';
import { Bike, Shield, Store, Globe, ArrowLeft } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(
    () => (isSupabaseConfigured ? null : authService.getCurrentUser())
  );
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured);
  const [currentPortal, setCurrentPortal] = useState<'studio' | 'delivery' | 'admin' | 'builder' | 'shop'>('studio');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeStorefrontSlug, setActiveStorefrontSlug] = useState<string | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [activeLegalModal, setActiveLegalModal] = useState<'privacy' | 'terms' | 'faq' | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  // Restore the real Supabase session and keep the UI in sync with auth changes.
  useEffect(() => {
    let active = true;
    let syncVersion = 0;

    const restoreSession = async () => {
      const version = ++syncVersion;

      try {
        const user = await authService.getAuthenticatedUser();

        if (active && version === syncVersion) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.error('Session restoration failed:', error);

        if (active && version === syncVersion) {
          setCurrentUser(null);
        }
      } finally {
        if (active && version === syncVersion) {
          setIsAuthReady(true);
        }
      }
    };

    let unsubscribeAuth: (() => void) | undefined;

    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          syncVersion += 1;
          if (active) {
            setCurrentUser(null);
            setIsAuthReady(true);
          }
          return;
        }

        // Do profile/session work after Supabase finishes its auth callback.
        // This prevents waiting on Supabase auth operations while its lock is held.
        Promise.resolve().then(() => {
          if (active) {
            void restoreSession();
          }
        });
      });

      unsubscribeAuth = () => data.subscription.unsubscribe();

      // Also restore any session already saved in the browser.
      void restoreSession();
    } else {
      setCurrentUser(authService.getCurrentUser());
      setIsAuthReady(true);
    }

    // Keep the existing local demo/business/order store subscription.
    const unsubscribeStore = subscribeToStore(() => {
      if (!isSupabaseConfigured) {
        setCurrentUser(authService.getCurrentUser());
      }
    });

    return () => {
      active = false;
      syncVersion += 1;
      unsubscribeAuth?.();
      unsubscribeStore();
    };
  }, []);

  // Check URL params on initial load (support ?site=slug, ?tenant=slug, ?tracking=ORD-..., ?portal=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const siteParam = params.get('site') || params.get('tenant');
    if (siteParam) {
      setActiveStorefrontSlug(siteParam);
      return;
    }

    const trackParam = params.get('tracking');
    if (trackParam) {
      setTrackingNumber(trackParam);
      setShowTrackingModal(true);
    }

    const portalParam = params.get('portal');
    if (portalParam === 'delivery') {
      setCurrentPortal('delivery');
    } else if (portalParam === 'admin') {
      setCurrentPortal('admin');
    } else if (portalParam === 'builder') {
      setCurrentPortal('builder');
    } else if (portalParam === 'shop') {
      setCurrentPortal('shop');
    }
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
      setCurrentUser(null);
      setCurrentPortal('studio');
      showToast('Signed out successfully.');
    } catch (error) {
      console.error('Logout failed:', error);
      showToast('Unable to sign out. Please try again.');
    }
  };

  const handleDeliveryLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    showToast(`Welcome, ${user.full_name}! Delivery console loaded.`);
  };

  const handleGeneralAuthSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setShowAuthModal(false);
    showToast(`Welcome back, ${user.full_name}!`);

    if (user.role === 'admin' || user.role === 'super_admin') {
      setCurrentPortal('admin');
    } else if (user.role === 'delivery_boy') {
      setCurrentPortal('delivery');
    } else if (user.role === 'shop_owner') {
      setCurrentPortal('shop');
    } else {
      setCurrentPortal('builder');
    }
  };

  // Public tenant storefronts do not need a customer login session.
  if (activeStorefrontSlug) {
    return (
      <PublicStorefront
        siteSlug={activeStorefrontSlug}
        onNavigateHome={() => setActiveStorefrontSlug(null)}
      />
    );
  }

  // Prevent protected portals from briefly showing a signed-out state during session restore.
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#08080A] text-[#E8E8ED] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#DFBA5A]/30 border-t-[#DFBA5A] animate-spin" />
          <p className="text-sm text-[#DFBA5A]">Restoring your secure session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080A] text-[#E8E8ED] font-sans antialiased selection:bg-[#D4AF37]/30 selection:text-[#F7E7B4] flex flex-col justify-between">

      {/* 1. PORTAL: DEDICATED DELIVERY BOY SECTION */}
      {currentPortal === 'delivery' && (
        currentUser && currentUser.role === 'delivery_boy' && currentUser.status === 'active' ? (
          <DeliveryDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            onShowToast={showToast}
          />
        ) : (
          <DeliveryLogin
            onSuccess={handleDeliveryLoginSuccess}
            onNavigateHome={() => setCurrentPortal('studio')}
          />
        )
      )}

      {/* 2. PORTAL: ADMIN DASHBOARD */}
      {currentPortal === 'admin' && (
        currentUser && (
          currentUser.role === 'admin' ||
          currentUser.role === 'super_admin'
        ) ? (
          <AdminDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
            onShowToast={showToast}
          />
        ) : (
          <div className="min-h-screen bg-[#07070A] flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md w-full bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl p-8 space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-[#1C1810] border border-[#DFBA5A]/40 flex items-center justify-center text-[#DFBA5A] mx-auto">
                <Shield className="w-7 h-7" />
              </div>
              <h2 className="font-luxury text-2xl font-bold text-white">Administrator Access Required</h2>
              <p className="text-xs text-[#8A8A9C] leading-relaxed">
                The Master Control Panel is reserved exclusively for platform administrators. Please sign in with your administrator credentials.
              </p>
              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider"
                >
                  Sign In as Admin
                </button>
                <button
                  onClick={() => setCurrentPortal('studio')}
                  className="w-full py-2.5 rounded-lg bg-[#14141E] text-xs text-[#8C8C9E] hover:text-white border border-[#222230]"
                >
                  Return to Home
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* 3. PORTAL: MULTI-TENANT WEBSITE BUILDER */}
      {currentPortal === 'builder' && (
        <div className="min-h-screen bg-[#08080A] text-[#E8E8ED] flex flex-col">
          <Navbar
            currentUser={currentUser}
            currentPortal={currentPortal}
            onNavigatePortal={(p) => setCurrentPortal(p)}
            onOpenAuth={() => setShowAuthModal(true)}
            onLogout={handleLogout}
          />
          <div className="pt-24 flex-1">
            <div className="max-w-7xl mx-auto px-6 mb-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentPortal('studio')}
                className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Corporate Studio Showcase</span>
              </button>

              <span className="text-xs font-mono text-[#8C8C9E]">
                Active Mode: Multi-Tenant Website Builder
              </span>
            </div>

            <WebsiteBuilder
              currentUser={currentUser}
              onShowToast={showToast}
            />
          </div>
          <Footer
            onOpenLegal={(type) => setActiveLegalModal(type)}
            onOpenTracking={() => setShowTrackingModal(true)}
          />
        </div>
      )}

      {/* PORTAL: SHOP OWNER DASHBOARD */}
      {currentPortal === 'shop' && (
        currentUser && currentUser.role === 'shop_owner' ? (
          <ShopOwnerDashboard
            currentUser={currentUser}
            businessId={currentUser.active_business_id || (currentUser.business_ids && currentUser.business_ids[0]) || 'biz_01'}
            onLogout={handleLogout}
            onShowToast={showToast}
          />
        ) : (
          <div className="min-h-screen bg-[#07070A] flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md w-full bg-[#0E0E16] border border-[#2B2B3C] rounded-2xl p-8 space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-[#1C1810] border border-[#DFBA5A]/40 flex items-center justify-center text-[#DFBA5A] mx-auto">
                <Store className="w-7 h-7" />
              </div>
              <h2 className="font-luxury text-2xl font-bold text-white">Shop Owner Console</h2>
              <p className="text-xs text-[#8A8A9C] leading-relaxed">
                Manage your store catalog, incoming orders, delivery dispatches, quotes, GST invoices, and 15 Gemini AI business engines.
              </p>
              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider"
                >
                  Sign In to Shop Console
                </button>
                <button
                  onClick={() => setCurrentPortal('studio')}
                  className="w-full py-2.5 rounded-lg bg-[#14141E] text-xs text-[#8C8C9E] hover:text-white border border-[#222230]"
                >
                  Return to Home
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* 4. PORTAL: MAIN CORPORATE FLAGSHIP SHOWCASE */}
      {currentPortal === 'studio' && (
        <>
          <Navbar
            currentUser={currentUser}
            currentPortal={currentPortal}
            onNavigatePortal={(p) => setCurrentPortal(p)}
            onOpenAuth={() => setShowAuthModal(true)}
            onLogout={handleLogout}
            onOpenTracking={() => setShowTrackingModal(true)}
          />

          <main>
            <Hero />

            {/* Quick Multi-Tenant Platform Discovery Banner */}
            <section className="py-6 bg-[#0E0E16] border-y border-[#20202E]">
              <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A]">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-luxury font-bold text-white text-sm">
                      Vijay Visuals Multi-Tenant Website Builder & Delivery Fleet
                    </h4>
                    <p className="text-xs text-[#8A8A9E]">
                      20+ Industry Templates · Telugu, English & Hindi · Automated Delivery Boy Dispatch
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPortal('builder')}
                    className="px-4 py-2 rounded-lg bg-[#181826] hover:bg-[#202034] text-xs font-semibold text-[#DFBA5A] border border-[#DFBA5A]/40"
                  >
                    Open 20+ Templates
                  </button>
                  <button
                    onClick={() => setCurrentPortal('delivery')}
                    className="px-4 py-2 rounded-lg bg-[#152418] hover:bg-[#1A301E] text-xs font-semibold text-[#25D366] border border-[#25D366]/40 flex items-center gap-1.5"
                  >
                    <Bike className="w-3.5 h-3.5" />
                    <span>Delivery Fleet Login</span>
                  </button>
                </div>
              </div>
            </section>

            <ServicesSection onSelectService={(title) => showToast(`Selected "${title}". Scroll to contact or book on WhatsApp!`)} />
            <section id="builder" className="border-b border-[#1E1E26] bg-[#09090E]">
              <WebsiteBuilder
                currentUser={currentUser}
                onShowToast={showToast}
              />
            </section>
            <PortfolioSection />
            <CostCalculator />
            <PricingSection />
            <AboutSection />
            <TestimonialsSection />
            <ContactSection onShowToast={showToast} />
          </main>

          <Footer
            onOpenLegal={(type) => setActiveLegalModal(type)}
            onOpenTracking={() => setShowTrackingModal(true)}
          />

          <FloatingWhatsApp />
        </>
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleGeneralAuthSuccess}
      />

      <OrderTrackingModal
        isOpen={showTrackingModal}
        initialOrderNumber={trackingNumber}
        onClose={() => {
          setShowTrackingModal(false);
          setTrackingNumber('');
        }}
      />

      <LegalModal
        type={activeLegalModal}
        onClose={() => setActiveLegalModal(null)}
      />

      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
