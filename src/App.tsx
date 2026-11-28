import React, { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { apiFetch } from './lib/api';
import { getScrollBehavior } from './lib/motion';
import { CurrencyCode, GLOBAL_CURRENCIES, Lang, SUPPORTED_LANGUAGES } from './data/content';
import { AppView, OrderRecord, PlatformAnnouncementRecord, PlatformPlanRecord, TenantRecord } from './types/platform';
import { applyPlatformMetadata } from './lib/platformMetadata';
import { getStorefrontSlug } from '../shared/seo';
import { Navbar } from './components/Navbar';
import { StudioLanding } from './components/StudioLanding';
import { TemplateMarketplace } from './components/TemplateMarketplace';
import { WebsiteBuilder } from './components/WebsiteBuilder';
import { StorefrontView } from './components/StorefrontView';
import { DashboardsHub } from './components/DashboardsHub';
import { BusinessOwnerDashboard } from './components/BusinessOwnerDashboard';
import { AiAutomationCenter } from './components/AiAutomationCenter';
import { OrderTrackerModal } from './components/OrderTrackerModal';
import { InvoiceModal } from './components/InvoiceModal';
import { OfflineIndicator } from './components/PWAControls';
import { BackToTop } from './components/BackToTop';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { AuthModal } from './components/auth/AuthModal';
import { InteractiveDemoHub } from './components/InteractiveDemoHub';
import { DemoBusinessBuilder } from './components/DemoBusinessBuilder';
import { CustomerProposalView } from './components/CustomerProposalView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFoundView } from './components/NotFoundView';
import { PolicyView, type PolicyPageKey } from './components/PolicyView';
import { parseTenantDeliveryHostname } from '../shared/tenantHost';
import {
  resolveTemplateHandoff,
  type TemplateBuilderSeed,
  type TemplateHandoffRequest,
} from './lib/templateTransfer';

const VALID_LANGS = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));
const VALID_CURRENCIES = new Set<string>(GLOBAL_CURRENCIES.map((c) => c.code));
const POLICY_ROUTES: Record<string, PolicyPageKey> = {
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/refund': 'refund',
  '/shipping': 'shipping',
  '/cancellation': 'cancellation',
};

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

function appendLangParam(url: string, lang: Lang): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (lang === 'en') params.delete('lang');
  else params.set('lang', lang);
  const serialized = params.toString();
  return `${path}${serialized ? `?${serialized}` : ''}`;
}

function parseRouteFromPath(): { view: AppView; slug: string | null } {
  const pathname = window.location.pathname || '/';
  if (pathname === '/' || pathname === '') return { view: 'studio', slug: null };
  if (pathname.startsWith('/proposal/')) {
    const token = decodeURIComponent(pathname.slice('/proposal/'.length).split('/')[0] || '').trim();
    if (token) return { view: 'proposal', slug: token };
  }
  if (pathname.startsWith('/proposals/')) {
    const token = decodeURIComponent(pathname.slice('/proposals/'.length).split('/')[0] || '').trim();
    if (token) return { view: 'proposal', slug: token };
  }
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const policyKey = POLICY_ROUTES[normalizedPath];
  if (policyKey) return { view: 'policy', slug: policyKey };
  const storefrontSlug = getStorefrontSlug(pathname);
  if (storefrontSlug) return { view: 'storefront', slug: storefrontSlug };
  if (pathname.startsWith('/site/') || pathname.startsWith('/sites/')) {
    return { view: 'storefront', slug: null };
  }
  if (pathname.startsWith('/demo-builder')) return { view: 'demo-builder', slug: null };
  if (pathname.startsWith('/demo')) return { view: 'demo', slug: null };
  if (pathname.startsWith('/builder')) return { view: 'builder', slug: null };
  if (pathname.startsWith('/marketplace')) return { view: 'marketplace', slug: null };
  if (pathname.startsWith('/dashboards/platform-owner')) return { view: 'owner-dashboard', slug: null };
  if (pathname.startsWith('/dashboards')) return { view: 'dashboards', slug: null };
  if (pathname.startsWith('/ai')) return { view: 'ai', slug: null };
  return { view: 'not-found', slug: null };
}

function getEdgeTenantSlug(): string | null {
  return (
    document
      .querySelector('meta[name="vv-tenant-slug"]')
      ?.getAttribute('content')
      ?.trim() || null
  );
}

function PlatformShell() {
  const { profile, authError, authModalOpen, authModalMode, closeAuthModal, handleSupabaseAuthSuccess } = useAuth();
  const initial = parseRouteFromPath();
  const [activeView, setActiveView] = useState<AppView>(initial.view);
  const [activeSlug, setActiveSlug] = useState<string | null>(initial.slug);
  const [isPublicTenantHost, setIsPublicTenantHost] = useState<boolean>(() => Boolean(getEdgeTenantSlug()));
  // /site/:slug is tenant-facing even on the platform host. Never show owner,
  // marketplace, or platform-support guidance inside a published storefront.
  const publicStorefront = isPublicTenantHost || activeView === 'storefront';
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
  const [builderTenantId, setBuilderTenantId] = useState<number | null>(null);
  const [builderTemplateSeed, setBuilderTemplateSeed] = useState<TemplateBuilderSeed | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const changeLanguage = useCallback((next: Lang) => {
    setLang(next);
    try {
      const url = new URL(window.location.href);
      if (next === 'en') url.searchParams.delete('lang');
      else url.searchParams.set('lang', next);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Language preference still applies to this session.
    }
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

  // Keep browser head metadata aligned with edge-rendered metadata on language
  // and SPA view transitions. Tenant hosts own their metadata separately.
  useEffect(() => {
    if (isPublicTenantHost || activeView === 'storefront') return;
    const hasExplicitLang = new URLSearchParams(window.location.search).has('lang');
    return applyPlatformMetadata(document, window.location.pathname, lang, hasExplicitLang);
  }, [lang, activeView, isPublicTenantHost]);

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

  // Multi-Tenant Hostname Auto-Resolution: verified custom domains and published
  // default delivery subdomains become white-labeled public tenant sessions.
  useEffect(() => {
    const host = (window.location.hostname || '').toLowerCase();
    const edgeMetaSlug = getEdgeTenantSlug();
    if (edgeMetaSlug) {
      setActiveView('storefront');
      setActiveSlug(edgeMetaSlug);
      setIsPublicTenantHost(true);
      return;
    }

    const deliveryHost = parseTenantDeliveryHostname(host);
    const isPlatformHost =
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      (host.endsWith('.pages.dev') && !deliveryHost);
    if (isPlatformHost) return;

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
          setIsPublicTenantHost(true);
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

  const navigateTo = useCallback(
    (view: AppView, slug: string | null = null) => {
      setActiveView(view);
      setActiveSlug(slug);
      const route =
        view === 'storefront' && slug
          ? `/site/${slug}`
          : view === 'proposal' && slug
            ? `/proposal/${slug}`
            : view === 'studio'
              ? '/'
              : view === 'owner-dashboard'
                ? '/dashboards/platform-owner'
                : `/${view}`;
      window.history.pushState({}, '', appendLangParam(route, lang));
      window.scrollTo({ top: 0, behavior: getScrollBehavior() });
    },
    [lang]
  );

  const startTemplateHandoff = useCallback(
    (request: TemplateHandoffRequest) => {
      const resolved = resolveTemplateHandoff(request);
      if (!resolved.ok) {
        showToast(resolved.error);
        return;
      }
      setBuilderTenantId(null);
      setBuilderTemplateSeed(resolved.seed);
      navigateTo('builder');
      showToast(`Template loaded: ${resolved.seed.templateName}. Edit this independent local copy.`);
    },
    [navigateTo, showToast]
  );

  // Handle Cashfree Hosted Checkout Return & Auto-Verification
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const isReturn = url.pathname.includes('/payments/cashfree/return');
      const orderId = url.searchParams.get('order_id');
      if (isReturn && orderId && profile) {
        apiFetch<{ verified: boolean; status: string; websiteUrl?: string }>(
          '/api/payments/cashfree/verify',
          {
            method: 'POST',
            body: JSON.stringify({ orderId }),
          }
        )
          .then((res) => {
            if (res.verified) {
              showToast('Cashfree payment verified! Your website package is active.');
              navigateTo('dashboards');
            } else {
              showToast(`Cashfree payment status: ${res.status}`);
            }
          })
          .catch((err) => {
            showToast(err instanceof Error ? err.message : 'Cashfree payment verification failed.');
          });
      }
    } catch {}
  }, [profile, navigateTo, showToast]);

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
        .catch((err) => {
          // D1 migration/storage errors are returned as 503. Do not leave the
          // optimistic UI/local cache claiming a change that was not persisted.
          setWishlistIds((prev) => {
            const reverted = prev.includes(productId)
              ? prev.filter((id) => id !== productId)
              : [...prev, productId];
            try {
              window.localStorage.setItem('vv_wishlist_ids', JSON.stringify(reverted));
            } catch {}
            return reverted;
          });
          const message = err instanceof Error ? err.message : 'Wishlist is temporarily unavailable.';
          showToast(`Wishlist update failed. ${message}`);
        });
    }
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-[#E8E8ED] flex flex-col overflow-x-hidden w-full">
      {mapsQuotaExceeded && !isPublicTenantHost && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-950/95 px-4 py-2.5 text-center text-xs text-amber-100 flex flex-wrap items-center justify-center gap-3"
        >
          <span>
            Google Maps API daily demo quota has been reached. Manual address entry and Get Directions links continue working.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio#quota_exceeded_errors"
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

      {activeView !== 'proposal' && activeView !== 'storefront' && !isPublicTenantHost && (
        <>
          <Navbar activeView={activeView} onNavigate={(v) => navigateTo(v)} lang={lang} />

          {/* Global Persistent 12-Language & Multi-Currency Utility Strip (Public Site + Dashboards) */}
          <div className="border-b border-[#181822] bg-[#0B0B10] w-full">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="hidden items-center gap-2 text-[#A7A7BA] text-[11px] sm:flex sm:text-xs">
                <Globe className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span className="truncate">Made in India · Built for the World</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[#8E8EA2]">
                  <span className="sr-only">Language</span>
                  <select
                    aria-label="Select platform language"
                    value={lang}
                    onChange={(e) => changeLanguage(e.target.value as Lang)}
                    className="min-h-11 rounded border border-[#252534] bg-[#0E0E15] px-2 py-1 text-[11px] sm:text-xs text-[#ECC86A] focus:border-[#D4AF37] focus:outline-none max-w-[150px] sm:max-w-none"
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
                    className="min-h-11 rounded border border-[#252534] bg-[#0E0E15] px-2 py-1 text-[11px] sm:text-xs text-[#E8E8ED] focus:border-[#D4AF37] focus:outline-none max-w-[110px] sm:max-w-none"
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
        </>
      )}

      {announcements.length > 0 && activeView !== 'storefront' && !isPublicTenantHost && (
        <div className="border-b border-[#D4AF37]/25 bg-[#12100A] px-6 py-2 text-center text-xs text-[#F2DC9B]">
          <strong className="mr-2">{announcements[0].title}:</strong>
          <span>{announcements[0].message}</span>
        </div>
      )}

      <div className="flex-1">
        {activeView === 'studio' && (
          <ErrorBoundary sectionName="Platform Overview">
            <StudioLanding
              mode={activeView}
              lang={lang}
              onChangeLang={changeLanguage}
              currency={currency}
              fxRates={fxRates}
              fxSource={fxSource}
              tenants={tenants}
              plans={plans}
              onNavigate={(v) => navigateTo(v)}
              onUseTheme={(themeId) => startTemplateHandoff({ source: 'theme-gallery', themeId })}
              onOpenStorefront={(slug) => navigateTo('storefront', slug)}
              onOpenTracker={() => setTrackerOpen(true)}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'marketplace' && (
          <ErrorBoundary sectionName="Template Marketplace">
            <TemplateMarketplace
              plans={plans}
              lang={lang}
              onUseTemplate={(templateId) => startTemplateHandoff({ source: 'marketplace', templateId })}
              onOpenStorefront={(slug) => navigateTo('storefront', slug)}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'demo' && (
          <ErrorBoundary sectionName="Interactive Demo Hub">
            <InteractiveDemoHub
              onNavigatePlan={(planCode) => {
                navigateTo('studio');
                showToast(`Selected package: ${planCode}. Opening checkout...`);
              }}
              onGoBuilder={(tId?: number) => {
                setBuilderTenantId(tId ?? null);
                navigateTo('builder');
              }}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'demo-builder' && (
          <ErrorBoundary sectionName="Demo Business Builder">
            <DemoBusinessBuilder
              onOpenProposal={(token) => navigateTo('proposal', token)}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'builder' && (
          <ErrorBoundary sectionName="Website Builder">
            <WebsiteBuilder
              initialTenantId={builderTenantId}
              templateSeed={builderTemplateSeed}
              onTemplateSeedApplied={() => setBuilderTemplateSeed(null)}
              onPublished={() => {
                loadPublicData();
              }}
              onOpenStorefront={(slug) => navigateTo('storefront', slug)}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'storefront' && activeSlug && (
          <ErrorBoundary
            sectionName={publicStorefront ? 'Website' : 'Storefront View'}
            publicHost={publicStorefront}
          >
            <StorefrontView
              slug={activeSlug}
              lang={lang}
              publicHost={publicStorefront}
              wishlistIds={wishlistIds}
              onToggleWishlist={toggleWishlist}
              onBack={() => navigateTo('marketplace')}
              onGoDashboards={() => navigateTo('dashboards')}
              onOpenInvoice={(order, tenantName) => setInvoiceState({ order, tenantName })}
              onUseTemplate={
                activeSlug
                  ? () => startTemplateHandoff({ source: 'demo-storefront', slug: activeSlug })
                  : undefined
              }
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {(activeView === 'storefront' && !activeSlug) || activeView === 'not-found' ? (
          <NotFoundView
            publicHost={publicStorefront}
            onGoHome={() => navigateTo('studio')}
            onGoMarketplace={() => navigateTo('marketplace')}
          />
        ) : null}

        {activeView === 'dashboards' && (
          <ErrorBoundary sectionName="Dashboards Hub">
            <DashboardsHub
              allTenants={tenants}
              wishlistIds={wishlistIds}
              lang={lang}
              onToggleWishlist={toggleWishlist}
              onRefreshTenants={loadPublicData}
              onOpenStorefront={(slug) => navigateTo('storefront', slug)}
              onOpenInvoice={(order, tenantName) => setInvoiceState({ order, tenantName })}
              onGoBuilder={(tId?: number) => {
                setBuilderTenantId(tId ?? null);
                navigateTo('builder');
              }}
              onGoAiCenter={() => navigateTo('ai')}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'owner-dashboard' && (
          <ErrorBoundary sectionName="Business Owner Dashboard">
            <BusinessOwnerDashboard
              onNotify={showToast}
              onGoDashboards={() => navigateTo('dashboards')}
            />
          </ErrorBoundary>
        )}

        {activeView === 'ai' && (
          <ErrorBoundary sectionName="AI Automation Center">
            <AiAutomationCenter
              lang={lang}
              onGoBuilder={() => navigateTo('builder')}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'proposal' && (
          <ErrorBoundary sectionName="Proposal Viewer">
            <CustomerProposalView
              token={activeSlug || ''}
              onBackToHome={() => navigateTo('studio')}
              onNotify={showToast}
            />
          </ErrorBoundary>
        )}

        {activeView === 'policy' && activeSlug && (
          <ErrorBoundary sectionName="Policy Page">
            <PolicyView page={activeSlug as PolicyPageKey} />
          </ErrorBoundary>
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
        tenantName={invoiceState?.tenantName || 'Store'}
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
      <PWAUpdatePrompt />
      {(activeView === 'studio' || activeView === 'marketplace') && <BackToTop />}

      {toast && (
        <div
          role="status"
          className="fixed right-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg border border-[#D4AF37]/50 bg-[#14141D] px-4 py-3 text-xs text-[#F5E4B2] shadow-2xl sm:right-5 sm:max-w-sm"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
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
