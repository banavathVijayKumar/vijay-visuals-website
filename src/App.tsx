import React, { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { apiFetch } from './lib/api';
import { CurrencyCode, GLOBAL_CURRENCIES, Lang, SUPPORTED_LANGUAGES } from './data/content';
import { AppView, OrderRecord, PlatformAnnouncementRecord, PlatformPlanRecord, TenantRecord } from './types/platform';
import { Navbar } from './components/Navbar';
import { StudioLanding } from './components/StudioLanding';
import { WebsiteBuilder } from './components/WebsiteBuilder';
import { StorefrontView } from './components/StorefrontView';
import { DashboardsHub } from './components/DashboardsHub';
import { AiAutomationCenter } from './components/AiAutomationCenter';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { InvoiceModal } from './components/InvoiceModal';
import { OfflineIndicator } from './components/PWAControls';
import { AuthModal } from './components/auth/AuthModal';
import { InteractiveDemoHub } from './components/InteractiveDemoHub';

const VALID_LANGS = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));
const VALID_CURRENCIES = new Set<string>(GLOBAL_CURRENCIES.map((c) => c.code));

function resolveInitialLang(): Lang {
  try {
    const queryLang = new URLSearchParams(window.location.search).get('lang')?.toLowerCase() || '';
    if (VALID_LANGS.has(queryLang)) return queryLang as Lang;
    const stored = window.localStorage.getItem('vv_lang')?.toLowerCase() || '';
    if (VALID_LANGS.has(stored)) return stored as Lang;
  } catch {}
  return 'en';
}

function resolveInitialCurrency(): CurrencyCode {
  try {
    const stored = window.localStorage.getItem('vv_currency')?.toUpperCase() || '';
    if (VALID_CURRENCIES.has(stored)) return stored as CurrencyCode;
  } catch {}
  return 'INR';
}

function parseRouteFromPath(): { view: AppView; slug: string | null } {
  const pathname = window.location.pathname || '/';
  if (pathname.startsWith('/site/')) {
    const slug = decodeURIComponent(pathname.slice('/site/'.length).split('/')[0] || '').trim().toLowerCase();
    if (slug) return { view: 'storefront', slug };
  }
  if (pathname.startsWith('/sites/')) {
    const slug = decodeURIComponent(pathname.slice('/sites/'.length).split('/')[0] || '').trim().toLowerCase();
    if (slug) return { view: 'storefront', slug };
  }
  if (pathname.startsWith('/demo')) return { view: 'demo', slug: null };
  if (pathname.startsWith('/builder')) return { view: 'builder', slug: null };
  if (pathname.startsWith('/marketplace')) return { view: 'marketplace', slug: null };
  if (pathname.startsWith('/dashboards')) return { view: 'dashboards', slug: null };
  if (pathname.startsWith('/ai')) return { view: 'ai', slug: null };
  return { view: 'studio', slug: null };
}

function PlatformShell() {
  const { profile, authError, authModalOpen, authModalMode, closeAuthModal, handleSupabaseAuthSuccess } = useAuth();
  const initial = parseRouteFromPath();
  const [activeView, setActiveView] = useState<AppView>(initial.view);
  const [activeSlug, setActiveSlug] = useState<string | null>(initial.slug);
  const [lang, setLang] = useState<Lang>(resolveInitialLang);
  const [currency, setCurrency] = useState<CurrencyCode>(resolveInitialCurrency);
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null);
  const [fxSource, setFxSource] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [plans, setPlans] = useState<PlatformPlanRecord[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncementRecord[]>([]);
  const [wishlistIds, setWishlistIds] = useState<number[]>(() => {
    try {
      const saved = window.localStorage.getItem('vv_wishlist_ids');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [invoiceState, setInvoiceState] = useState<{ order: OrderRecord; tenantName: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  // Persist language & sync <html lang dir> including RTL support for Urdu
  useEffect(() => {
    const meta = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
    try {
      window.localStorage.setItem('vv_lang', lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    try {
      window.localStorage.setItem('vv_currency', currency);
    } catch {}
  }, [currency]);

  // Fetch real live/cached FX rates (never fabricated if unavailable)
  useEffect(() => {
    apiFetch<{ available?: boolean; rates?: Record<string, number> | null; providerSource?: string }>(
      '/api/platform/global?scope=rates'
    )
      .then((res) => {
        if (res.available && res.rates) {
          setFxRates(res.rates);
          setFxSource(res.providerSource || 'open.er-api.com');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authError) showToast(authError);
  }, [authError, showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const loadPublicData = useCallback(async () => {
    try {
      const [tRes, pRes, annRes] = await Promise.all([
        apiFetch<{ tenants: TenantRecord[] }>('/api/tenants'),
        apiFetch<{ plans: PlatformPlanRecord[] }>('/api/plans'),
        apiFetch<{ announcements: PlatformAnnouncementRecord[] }>('/api/announcements').catch(() => ({
          announcements: [],
        })),
      ]);
      setTenants(tRes.tenants || []);
      setPlans(pRes.plans || []);
      setAnnouncements(annRes.announcements || []);
    } catch (err) {
      console.error('Failed to load platform directory:', err);
    }
  }, []);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  // Multi-Tenant Custom Hostname Auto-Resolution (only activates on verified customer custom domains)
  useEffect(() => {
    const host = (window.location.hostname || '').toLowerCase();
    const isPlatformHost =
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      host.endsWith('.pages.dev');
    if (isPlatformHost) return;

    const edgeMetaSlug = document
      .querySelector('meta[name="vv-tenant-slug"]')
      ?.getAttribute('content')
      ?.trim();
    if (edgeMetaSlug) {
      setActiveView('storefront');
      setActiveSlug(edgeMetaSlug);
      return;
    }

    apiFetch<{
      matched: boolean;
      tenantSlug?: string;
      redirectUrl?: string | null;
    }>('/api/domains/resolve')
      .then((res) => {
        if (res.matched && res.redirectUrl) {
          window.location.replace(`${res.redirectUrl}${window.location.pathname}${window.location.search}`);
          return;
        }
        if (res.matched && res.tenantSlug) {
          setActiveView('storefront');
          setActiveSlug(res.tenantSlug);
        }
      })
      .catch(() => {});
  }, []);

  // Sync cross-device wishlist when authenticated
  useEffect(() => {
    if (!profile) return;
    apiFetch<{ productIds: number[] }>('/api/customer/wishlist')
      .then((res) => {
        if (Array.isArray(res.productIds)) {
          setWishlistIds(res.productIds);
          try {
            window.localStorage.setItem('vv_wishlist_ids', JSON.stringify(res.productIds));
          } catch {}
        }
      })
      .catch(() => {});
  }, [profile]);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRouteFromPath();
      setActiveView(next.view);
      setActiveSlug(next.slug);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((view: AppView, slug: string | null = null) => {
    setActiveView(view);
    setActiveSlug(slug);
    const nextUrl =
      view === 'storefront' && slug
        ? `/site/${slug}`
        : view === 'studio'
          ? '/'
          : `/${view}`;
    window.history.pushState({}, '', nextUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleWishlist = (productId: number) => {
    setWishlistIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      try {
        window.localStorage.setItem('vv_wishlist_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (profile) {
      apiFetch<{ productIds: number[] }>('/api/customer/wishlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      })
        .then((res) => {
          if (Array.isArray(res.productIds)) setWishlistIds(res.productIds);
        })
        .catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-[#E8E8ED] flex flex-col">
      {mapsQuotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-950/95 px-4 py-2.5 text-center text-xs text-amber-100 flex flex-wrap items-center justify-center gap-3"
        >
          <span>
            Google Maps API daily demo quota has been reached. Manual address entry and Get Directions links continue working.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-300 hover:text-white"
            >
              Learn how to upgrade to your own Google Maps API key
            </a>
          </span>
          <button
            type="button"
            onClick={() => setMapsQuotaExceeded(false)}
            className="px-2 py-0.5 rounded border border-amber-400/40 text-[11px] hover:bg-amber-900/60"
          >
            Dismiss
          </button>
        </div>
      )}

      <Navbar activeView={activeView} onNavigate={(v) => navigateTo(v)} lang={lang} />

      {/* Global Persistent 12-Language & Multi-Currency Utility Strip (Public Site + Dashboards) */}
      <div className="border-b border-[#181822] bg-[#0B0B10]">
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#A7A7BA]">
            <Globe className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span>Made in India · Built for the World</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5 text-[#8E8EA2]">
              <span className="sr-only">Language</span>
              <select
                aria-label="Select platform language"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="rounded border border-[#252534] bg-[#0E0E15] px-2.5 py-1 text-xs text-[#ECC86A] focus:border-[#D4AF37] focus:outline-none"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} · {l.englishName}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-[#8E8EA2]">
              <span className="sr-only">Display currency</span>
              <select
                aria-label="Select display currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="rounded border border-[#252534] bg-[#0E0E15] px-2.5 py-1 text-xs text-[#E8E8ED] focus:border-[#D4AF37] focus:outline-none"
              >
                {GLOBAL_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {announcements.length > 0 && (
        <div className="border-b border-[#D4AF37]/25 bg-[#12100A] px-6 py-2 text-center text-xs text-[#F2DC9B]">
          <strong className="mr-2">{announcements[0].title}:</strong>
          <span>{announcements[0].message}</span>
        </div>
      )}

      <div className="flex-1">
        {(activeView === 'studio' || activeView === 'marketplace') && (
          <StudioLanding
            mode={activeView}
            lang={lang}
            onChangeLang={setLang}
            currency={currency}
            fxRates={fxRates}
            fxSource={fxSource}
            tenants={tenants}
            plans={plans}
            onNavigate={(v) => navigateTo(v)}
            onOpenStorefront={(slug) => navigateTo('storefront', slug)}
            onOpenTracker={() => setTrackerOpen(true)}
            onNotify={showToast}
          />
        )}

        {activeView === 'demo' && (
          <InteractiveDemoHub
            onNavigatePlan={(planCode) => {
              navigateTo('studio');
              // triggers plan purchase modal
              showToast(`Selected package: ${planCode}. Opening checkout...`);
            }}
            onGoBuilder={() => navigateTo('builder')}
            onNotify={showToast}
          />
        )}

        {activeView === 'builder' && (
          <WebsiteBuilder
            onPublished={() => {
              loadPublicData();
            }}
            onOpenStorefront={(slug) => navigateTo('storefront', slug)}
            onNotify={showToast}
          />
        )}

        {activeView === 'storefront' && activeSlug && (
          <StorefrontView
            slug={activeSlug}
            lang={lang}
            wishlistIds={wishlistIds}
            onToggleWishlist={toggleWishlist}
            onBack={() => navigateTo('marketplace')}
            onOpenInvoice={(order, tenantName) => setInvoiceState({ order, tenantName })}
            onNotify={showToast}
          />
        )}

        {activeView === 'dashboards' && (
          <DashboardsHub
            allTenants={tenants}
            wishlistIds={wishlistIds}
            lang={lang}
            onToggleWishlist={toggleWishlist}
            onRefreshTenants={loadPublicData}
            onOpenStorefront={(slug) => navigateTo('storefront', slug)}
            onOpenInvoice={(order, tenantName) => setInvoiceState({ order, tenantName })}
            onGoBuilder={() => navigateTo('builder')}
            onGoAiCenter={() => navigateTo('ai')}
            onNotify={showToast}
          />
        )}

        {activeView === 'ai' && (
          <AiAutomationCenter
            lang={lang}
            onGoBuilder={() => navigateTo('builder')}
            onNotify={showToast}
          />
        )}
      </div>

      <OrderTrackerModal
        open={trackerOpen}
        onClose={() => setTrackerOpen(false)}
        onOpenInvoice={(order, tenantName) => {
          setTrackerOpen(false);
          setInvoiceState({ order, tenantName });
        }}
      />

      <InvoiceModal
        order={invoiceState?.order || null}
        tenantName={invoiceState?.tenantName || 'Vijay Visuals Store'}
        onClose={() => setInvoiceState(null)}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={closeAuthModal}
        onSuccess={(sbUser) => {
          handleSupabaseAuthSuccess(sbUser);
          showToast(`Signed in securely as ${sbUser.full_name} (${sbUser.role}).`);
        }}
      />

      <OfflineIndicator />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-[#D4AF37]/50 bg-[#14141D] px-4 py-3 text-xs text-[#F5E4B2] shadow-2xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlatformShell />
    </AuthProvider>
  );
}
