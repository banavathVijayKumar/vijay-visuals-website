import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CreditCard,
  ExternalLink,
  Globe,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { initiatePlatformCheckout } from '../lib/razorpayClient';
import {
  BUSINESS_CATEGORIES,
  CONTACT_INFO,
  CurrencyCode,
  FAQS,
  formatMoneyFromInr,
  getI18n,
  Lang,
  PORTFOLIO_DATA,
  SERVICES_DATA,
  SUPPORTED_LANGUAGES,
  TESTIMONIALS_DATA,
} from '../data/content';
import { apiFetch } from '../lib/api';
import { AppView, PlatformPlanRecord, TenantRecord } from '../types/platform';
import { PWAInstallButton } from './PWAControls';
import { GlobalGrowthHub } from './GlobalGrowthHub';
import heroStudioImg from '../assets/images/hero_vijay_studio_1795055804014.jpg';
import fashionStoreImg from '../assets/images/store_fashion_royal_1795055802960.jpg';
import electronicsStoreImg from '../assets/images/store_electronics_audio_1795055804216.jpg';
import diningStoreImg from '../assets/images/store_gourmet_dining_1795055802368.jpg';

const PORTFOLIO_IMAGE_MAP: Record<string, string> = {
  'deccan-couture': fashionStoreImg,
  'nocturne-audio': electronicsStoreImg,
  'nizam-kitchen': diningStoreImg,
};

interface StudioLandingProps {
  mode: 'studio' | 'marketplace';
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  currency?: CurrencyCode;
  fxRates?: Record<string, number> | null;
  fxSource?: string | null;
  tenants: TenantRecord[];
  plans: PlatformPlanRecord[];
  onNavigate: (view: AppView) => void;
  onOpenStorefront: (slug: string) => void;
  onOpenTracker: () => void;
  onNotify: (msg: string) => void;
}

export const StudioLanding: React.FC<StudioLandingProps> = ({
  mode,
  lang,
  onChangeLang,
  currency = 'INR',
  fxRates = null,
  fxSource = null,
  tenants,
  plans,
  onNavigate,
  onOpenStorefront,
  onOpenTracker,
  onNotify,
}) => {
  const t = getI18n(lang);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [storeSearch, setStoreSearch] = useState('');

  // Stage 3 Modules 10 & 11: Server-Validated Platform Package Cart & Locked Quotation Builder
  const [selectedPlanCodes, setSelectedPlanCodes] = useState<string[]>(['business-website']);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [serverCalc, setServerCalc] = useState<{
    items: Array<{ code: string; name: string; cycleLabel: string; lineTotalInr: number }>;
    oneTimeSubtotalInr: number;
    recurringSubtotalInr: number;
    gstInr: number;
    grandTotalInr: number;
    thirdPartyNote: string;
  } | null>(null);
  const [propName, setPropName] = useState('');
  const [propEmail, setPropEmail] = useState('');
  const [propPhone, setPropPhone] = useState('');
  const [propBiz, setPropBiz] = useState('');
  const [propBusy, setPropBusy] = useState(false);
  const [lockedProposal, setLockedProposal] = useState<{ proposalNumber: string; grandTotalInr: number; gstInr: number } | null>(null);

  const { profile, openAuthModal } = useAuth();
  const [buyingPlan, setBuyingPlan] = useState<PlatformPlanRecord | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const handleOpenBuyNow = (plan: PlatformPlanRecord) => {
    if (!profile) {
      openAuthModal('signin');
      onNotify('Please sign in first to review and purchase your website package.');
      return;
    }
    setBuyingPlan(plan);
  };

  const handleConfirmPurchase = async () => {
    if (!buyingPlan) return;
    setPurchasing(true);
    try {
      await initiatePlatformCheckout({
        planCode: buyingPlan.code,
        planName: buyingPlan.name,
        prefill: {
          name: profile?.name || '',
          email: profile?.email || '',
          contact: profile?.phone || '',
        },
        onSuccess: (res) => {
          setBuyingPlan(null);
          onNotify(`Payment verified! ${buyingPlan.name} package activated.`);
          onNavigate('builder');
        },
        onError: (err) => {
          onNotify(err.message || 'Payment verification failed.');
        },
        onDismiss: () => {
          onNotify('Payment checkout was closed.');
        },
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to initialize Razorpay checkout.');
    } finally {
      setPurchasing(false);
    }
  };

  // Platform Newsletter Consent Form
  const [platNewsEmail, setPlatNewsEmail] = useState('');
  const [platNewsConsent, setPlatNewsConsent] = useState(false);

  // Contact inquiry form (saved to D1 support_tickets)
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSubject, setContactSubject] = useState('New Business Website & Platform Inquiry');
  const [contactMsg, setContactMsg] = useState('');
  const [submittingContact, setSubmittingContact] = useState(false);

  const matchesCategory = useCallback((itemCategory: string, selectedCatId: string): boolean => {
    if (selectedCatId === 'all') return true;
    const ic = (itemCategory || '').toLowerCase();
    const sc = selectedCatId.toLowerCase();
    if (ic === sc) return true;
    if (sc === 'grocery' && (ic.includes('grocery') || ic.includes('organic') || ic.includes('kirana') || ic.includes('provisions') || ic.includes('store') || ic.includes('dairy'))) return true;
    if (sc === 'clothing' && (ic.includes('clothing') || ic.includes('fashion') || ic.includes('silk') || ic.includes('boutique') || ic.includes('textile') || ic.includes('apparel') || ic.includes('couture'))) return true;
    if (sc === 'restaurant' && (ic.includes('restaurant') || ic.includes('cafe') || ic.includes('food') || ic.includes('kitchen') || ic.includes('dining') || ic.includes('biryani') || ic.includes('bakery'))) return true;
    if (sc === 'photography' && (ic.includes('photo') || ic.includes('studio') || ic.includes('cinema') || ic.includes('film') || ic.includes('visual'))) return true;
    if (sc === 'electronics' && (ic.includes('electro') || ic.includes('tech') || ic.includes('hardware') || ic.includes('gadget') || ic.includes('audio'))) return true;
    if (sc === 'professional_services' && (ic.includes('agency') || ic.includes('marketing') || ic.includes('consult') || ic.includes('service') || ic.includes('digital') || ic.includes('media'))) return true;
    if (sc === 'beauty_salon' && (ic.includes('beauty') || ic.includes('salon') || ic.includes('spa') || ic.includes('parlour'))) return true;
    if (sc === 'hotel' && (ic.includes('hotel') || ic.includes('resort') || ic.includes('hospitality') || ic.includes('lodge'))) return true;
    if (sc === 'gym' && (ic.includes('gym') || ic.includes('fitness') || ic.includes('workout') || ic.includes('crossfit'))) return true;
    if (sc === 'education' && (ic.includes('educat') || ic.includes('coach') || ic.includes('school') || ic.includes('academy') || ic.includes('institute'))) return true;
    if (sc === 'real_estate' && (ic.includes('real') || ic.includes('estate') || ic.includes('property') || ic.includes('realty'))) return true;
    if (sc === 'automobile' && (ic.includes('auto') || ic.includes('motor') || ic.includes('car') || ic.includes('bike') || ic.includes('garage'))) return true;
    return ic.includes(sc);
  }, []);

  const filteredTenants = useMemo(() => {
    return tenants.filter((item) => {
      const catMatch = matchesCategory(item.category, selectedCategory);
      const q = storeSearch.trim().toLowerCase();
      const textMatch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [tenants, selectedCategory, storeSearch, matchesCategory]);

  const togglePlanCode = (code: string) => {
    setSelectedPlanCodes((prev) =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter((c) => c !== code) : prev) : [...prev, code]
    );
  };

  React.useEffect(() => {
    if (selectedPlanCodes.length === 0) return;
    let active = true;
    apiFetch<NonNullable<typeof serverCalc>>('/api/proposals/calculate', {
      method: 'POST',
      body: JSON.stringify({ planCodes: selectedPlanCodes, billingPeriod }),
    })
      .then((res) => {
        if (active) setServerCalc(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedPlanCodes, billingPeriod, plans]);

  const handleLockProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propName.trim() || !propEmail.trim() || !propPhone.trim() || !propBiz.trim()) {
      onNotify('Complete your name, email, phone, and business name to lock this quotation.');
      return;
    }
    setPropBusy(true);
    try {
      const res = await apiFetch<{ proposal: { proposalNumber: string; grandTotalInr: number; gstInr: number } }>(
        '/api/proposals',
        {
          method: 'POST',
          body: JSON.stringify({
            planCodes: selectedPlanCodes,
            billingPeriod,
            customerName: propName.trim(),
            customerEmail: propEmail.trim(),
            customerPhone: propPhone.trim(),
            businessName: propBiz.trim(),
          }),
        }
      );
      setLockedProposal(res.proposal);
      onNotify(`Locked Quotation ${res.proposal.proposalNumber} saved! View & accept it in Dashboards.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to lock quotation.');
    } finally {
      setPropBusy(false);
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMsg.trim()) {
      onNotify('Please complete your name, email, and project message.');
      return;
    }
    setSubmittingContact(true);
    try {
      await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customerName: contactName.trim(),
          customerEmail: contactEmail.trim(),
          customerPhone: contactPhone.trim(),
          subject: contactSubject.trim() || 'Project Inquiry',
          message: contactMsg.trim(),
          category: 'project_inquiry',
        }),
      });
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactMsg('');
      onNotify('Inquiry saved to Vijay Visuals desk. Our team will respond shortly.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to send inquiry.');
    } finally {
      setSubmittingContact(false);
    }
  };

  const renderMarketplaceSection = () => (
    <section id="marketplace" className="py-16 md:py-24 border-b border-[#1D1D26]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-xs font-medium tracking-wider text-[#D4AF37] mb-2">
              Multi-Tenant Storefronts · 16 Business Categories
            </p>
            <h2 className="font-luxury text-2xl md:text-4xl font-bold text-white text-balance">
              {t.liveStoresTitle}
            </h2>
            <p className="text-sm text-[#9D9DB0] mt-2 max-w-2xl">{t.liveStoresSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#737388] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Search storefronts..."
                className="pl-9 pr-3 py-2 text-xs rounded-md border border-[#262634] bg-[#0D0D13] text-white placeholder-[#6D6D80] focus:border-[#D4AF37] focus:outline-none w-56"
              />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('builder')}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-gold-gradient text-[#08080A] whitespace-nowrap shrink-0"
            >
              Create Your Business Site
            </button>
          </div>
        </div>

        {/* Category Filter Tabs (Functional buttons, not static metadata pills) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              selectedCategory === 'all'
                ? 'bg-[#D4AF37] text-[#08080A]'
                : 'bg-[#12121A] text-[#A5A5B8] hover:text-white border border-[#222230]'
            }`}
          >
            All Categories ({tenants.length})
          </button>
          {BUSINESS_CATEGORIES.map((cat) => {
            const count = tenants.filter((t) => matchesCategory(t.category, cat.id)).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#D4AF37] text-[#08080A]'
                    : 'bg-[#12121A] text-[#A5A5B8] hover:text-white border border-[#222230]'
                }`}
              >
                {lang === 'te' ? cat.te : cat.label} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {filteredTenants.length === 0 ? (
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-10 text-center">
            <p className="text-sm text-[#A3A3B5] mb-4">
              No published storefronts match this category yet. Launch the first one in seconds with the Website Builder.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('builder')}
              className="px-5 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              Build a Website in This Category
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTenants.map((store) => (
              <article
                key={store.id}
                className="rounded-xl border border-[#21212E] bg-[#0E0E14] overflow-hidden flex flex-col hover:border-[#D4AF37]/50 transition-colors"
              >
                <div className="aspect-[4/3] bg-[#14141D] relative overflow-hidden">
                  {store.bannerImage ? (
                    <img
                      src={store.bannerImage}
                      alt={store.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-luxury text-2xl text-[#D4AF37]">
                      {store.logoText}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#08080A]/85 via-[#08080A]/25 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-[#E8E8ED]">
                    <span className="font-mono-tabular text-[#ECC86A]">/site/{store.slug}</span>
                    <span>{store.pwaEnabled ? t.websitePlusPwa : t.websiteOnly}</span>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="text-xs text-[#9898AA] mb-1.5 flex items-center gap-2">
                    <span className="capitalize">{store.category.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{store.codEnabled ? 'COD & UPI' : 'UPI'}</span>
                    {store.customDomain && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{store.customDomain}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-luxury text-lg font-semibold text-white mb-1.5">{store.name}</h3>
                  <p className="text-xs text-[#9E9EB2] leading-relaxed mb-5 flex-1">
                    {store.tagline || store.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenStorefront(store.slug)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-md border border-[#D4AF37]/45 text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A] text-xs font-semibold transition-colors"
                  >
                    <span>{t.openStore}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );

  if (mode === 'marketplace') {
    return (
      <div className="min-h-screen bg-[#08080A]">
        <div className="border-b border-[#1D1D26] bg-[#0B0B10] py-4">
          <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-[#A3A3B5]">
              Explore published multi-tenant businesses on Vijay Visuals · Click any store for full checkout & AI support
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenTracker}
                className="inline-flex items-center gap-1.5 text-xs text-[#ECC86A] hover:underline"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{t.trackOrder}</span>
              </button>
              <PWAInstallButton compact />
            </div>
          </div>
        </div>
        {renderMarketplaceSection()}
      </div>
    );
  }

  return (
    <div className="bg-[#08080A] text-[#E8E8ED]">
      {/* Utility Sub-Bar (keeps Top Header strictly 3 zones) */}
      <div className="border-b border-[#181822] bg-[#0B0B10]">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-[#9D9DB0]">
            <span>{CONTACT_INFO.location}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenTracker}
              className="inline-flex items-center gap-1.5 text-[#ECC86A] hover:underline"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>{t.trackOrder}</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <select
              aria-label="Quick language switcher"
              value={lang}
              onChange={(e) => onChangeLang(e.target.value as Lang)}
              className="rounded-md border border-[#252534] bg-[#0E0E15] px-2.5 py-1 text-xs text-[#ECC86A] focus:border-[#D4AF37] focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.englishName})
                </option>
              ))}
            </select>
            <PWAInstallButton compact />
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 md:py-24 border-b border-[#1D1D26]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium text-[#D4AF37] tracking-wide mb-4">
                {t.heroKicker}
              </p>
              <h1 className="font-luxury text-4xl sm:text-5xl font-bold text-white leading-[1.12] tracking-tight text-balance mb-6">
                {t.heroTitle}
              </h1>
              <p className="text-base text-[#A5A5B8] leading-relaxed max-w-xl mb-8">
                {t.heroSubtitle}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('builder')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-gold-gradient text-[#08080A] text-sm font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
                >
                  <span>{t.ctaLaunchBuilder}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('marketplace')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#2C2C3C] text-sm font-medium text-white hover:border-[#D4AF37] transition-colors whitespace-nowrap shrink-0"
                >
                  <Globe className="w-4 h-4 text-[#D4AF37]" />
                  <span>{t.ctaExploreStores}</span>
                </button>
                <a
                  href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I want to launch my business website on Vijay Visuals.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#ECC86A] hover:underline whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t.ctaWhatsApp}</span>
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] rounded-xl border border-[#242432] overflow-hidden relative bg-[#111118]">
                <img
                  src={heroStudioImg}
                  alt="Vijay Visuals Web Engineering and Cinema Studio"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080A]/90 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-luxury text-lg font-semibold text-white">Vijay Visuals Unified Core</p>
                    <p className="text-xs text-[#C6C6D4]">
                      Website Builder · E-Commerce · Delivery Fleet · Gemini AI · Optional PWA
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('ai')}
                    className="px-3.5 py-2 rounded-md bg-[#0E0E14]/90 border border-[#D4AF37]/50 text-xs font-medium text-[#ECC86A] hover:bg-[#191924]"
                  >
                    Open AI Automation Center
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grounded Studio Metrics Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-12 pt-8 border-t border-[#1C1C26]">
            <div>
              <p className="font-mono-tabular text-2xl font-semibold text-white">36 Templates</p>
              <p className="text-xs text-[#8E8EA2] mt-1">16 core industries · 36 templates ready to customize</p>
            </div>
            <div>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{CONTACT_INFO.projectsCompleted}</p>
              <p className="text-xs text-[#8E8EA2] mt-1">Web & cinematic commissions delivered</p>
            </div>
            <div>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{CONTACT_INFO.experienceYears}</p>
              <p className="text-xs text-[#8E8EA2] mt-1">Digital engineering & film production craft</p>
            </div>
            <div>
              <p className="font-mono-tabular text-2xl font-semibold text-white">4 Role Portals</p>
              <p className="text-xs text-[#8E8EA2] mt-1">Owner, Customer, Delivery & Super Admin</p>
            </div>
          </div>
        </div>
      </section>

      {/* About Vijay Visuals & Complete E-Commerce Architecture */}
      <section id="about" className="py-16 md:py-20 border-b border-[#1D1D26] bg-[#0B0B10]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-medium text-[#D4AF37]">About Vijay Visuals</p>
              <h2 className="font-luxury text-2xl md:text-4xl font-bold text-white text-balance">
                Built for Real Indian &amp; Global Business Owners
              </h2>
              <p className="text-sm text-[#A1A1B5] leading-relaxed">
                Vijay Visuals empowers independent boutiques, restaurants, clinics, jewellery houses, wholesalers,
                and service studios to launch an independent multi-tenant storefront with their own URL, catalogue,
                photo gallery, order checkout, and installable mobile app experience—without agency lock-in.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('builder')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#D4AF37] text-[#08080A] text-sm font-semibold hover:bg-[#E5C453]"
                >
                  Launch Your Website
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('marketplace')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-[#2C2C3C] bg-[#12121A] text-sm font-medium text-[#E4E4EE] hover:border-[#D4AF37]/50"
                >
                  Explore Live Websites
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  title: 'Full Multi-Image E-Commerce',
                  desc: 'Manage products with multiple photos, variants, MRP vs sale prices, wholesale tiers, stock tracking, featured/bestsellers, and customer reviews.',
                },
                {
                  title: 'Persistent Cart & Verified Checkout',
                  desc: 'Add to Cart or Buy Now with server-verified stock, coupon discounts, delivery fees, city/pincode address capture, COD, UPI, Razorpay, and WhatsApp.',
                },
                {
                  title: 'Business Gallery & Media Albums',
                  desc: 'Upload logos, hero banners, and categorized project/product galleries with full-screen lightbox viewing and drag-free ordering.',
                },
                {
                  title: 'Modular Templates & Installable PWA',
                  desc: 'Enable only the modules each business needs (Catalogue, Appointments, Quotes, Gallery, WhatsApp) plus a per-business installable PWA manifest.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-[#20202C] bg-[#0F0F16] p-5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-[#A1A1B5] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Platform Capabilities (01-04 Editorial List) */}
      <section id="services" className="py-16 md:py-24 border-b border-[#1D1D26]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-[#D4AF37] mb-2">Platform Architecture & Studio Services</p>
            <h2 className="font-luxury text-2xl md:text-4xl font-bold text-white text-balance">
              Everything Required to Run an Independent Online Business
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SERVICES_DATA.map((service) => (
              <div
                key={service.id}
                className="rounded-xl border border-[#20202C] bg-[#0D0D13] p-6 space-y-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-luxury text-xl font-semibold text-white">
                    {service.number}. {service.title}
                  </h3>
                </div>
                <p className="text-sm text-[#A2A2B4] leading-relaxed">{service.shortDescription}</p>
                <ul className="space-y-2 pt-2 border-t border-[#1B1B26] text-xs text-[#CFCFDA]">
                  {service.deliverables.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Multi-Tenant Business Marketplace */}
      {renderMarketplaceSection()}

      {/* Portfolio & Testimonials */}
      <section id="portfolio" className="py-16 md:py-24 border-b border-[#1D1D26]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12">
            <p className="text-xs font-medium text-[#D4AF37] mb-2">Case Studies & Client Evidence</p>
            <h2 className="font-luxury text-2xl md:text-4xl font-bold text-white">
              Proven Storefronts & Studio Commissions
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-14">
            {PORTFOLIO_DATA.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#21212E] bg-[#0E0E14] overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-[#14141D]">
                  <img
                    src={PORTFOLIO_IMAGE_MAP[item.id] || heroStudioImg}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-xs text-[#9898AA] mb-1">
                    {item.category} · {item.client}
                  </p>
                  <h3 className="font-luxury text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-xs font-mono-tabular text-[#ECC86A] mb-3">{item.metric}</p>
                  <p className="text-xs text-[#A3A3B5] leading-relaxed flex-1 mb-4">{item.summary}</p>
                  <button
                    type="button"
                    onClick={() => onOpenStorefront(item.slug)}
                    className="text-xs font-semibold text-[#ECC86A] hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>Inspect Live Storefront</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS_DATA.map((rev) => (
              <blockquote
                key={rev.id}
                className="rounded-xl border border-[#1E1E2A] bg-[#0C0C12] p-6 flex flex-col justify-between"
              >
                <p className="text-sm text-[#D2D2DF] leading-relaxed mb-5">“{rev.quote}”</p>
                <footer className="text-xs border-t border-[#1D1D28] pt-3">
                  <p className="font-semibold text-white">{rev.name}</p>
                  <p className="text-[#8E8EA0]">
                    {rev.role}, {rev.company} · {rev.location}
                  </p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Transparent Pricing & Interactive Estimator (Module 11) */}
      <section id="pricing" className="py-16 md:py-24 border-b border-[#1D1D26]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-medium text-[#D4AF37] mb-2">
              Super Admin Configurable Pricing · Honest Third-Party Cost Disclosure
            </p>
            <h2 className="font-luxury text-2xl md:text-4xl font-bold text-white text-balance">
              {t.pricingTitle}
            </h2>
            <p className="text-sm text-[#A0A0B2] mt-2">{t.pricingSubtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {plans
              .filter((p) => p.active && p.category !== 'addon' && p.category !== 'saas')
              .map((plan) => {
                let features: string[] = [];
                try {
                  features = JSON.parse(plan.featuresJson || '[]');
                } catch {
                  features = [];
                }
                const inCart = selectedPlanCodes.includes(plan.code);
                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-6 flex flex-col transition-colors ${
                      inCart ? 'border-[#D4AF37] bg-[#14120C]' : 'border-[#222230] bg-[#0E0E14]'
                    }`}
                  >
                    <p className="text-xs text-[#9D9DB0] mb-1">
                      {plan.billingCycle.replace('_', ' ')} · {plan.includesPwa ? 'Includes Optional PWA' : 'Editable Starting Price'}
                    </p>
                    <h3 className="font-luxury text-lg font-semibold text-white mb-2">{plan.name}</h3>
                    <p className="font-mono-tabular text-3xl font-bold text-[#ECC86A] mb-1">
                      {formatMoneyFromInr(plan.priceInr, currency, fxRates)}
                    </p>
                    {currency !== 'INR' && fxRates && fxRates[currency] ? (
                      <p className="text-[10px] text-[#8E8EA2] mb-3">
                        Approx. via {fxSource || 'live FX'} · Settled in ₹{plan.priceInr.toLocaleString('en-IN')} INR
                      </p>
                    ) : (
                      <div className="mb-3" />
                    )}
                    <ul className="space-y-2 text-xs text-[#CFCFDA] flex-1 mb-5">
                      {features.map((f, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-2 mb-3">
                      <button
                        type="button"
                        onClick={() => handleOpenBuyNow(plan)}
                        className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Buy Now · ₹{plan.priceInr.toLocaleString('en-IN')}</span>
                      </button>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onNavigate('builder')}
                          className="py-1.5 px-2 rounded-md border border-[#2B2B3C] text-[11px] font-medium text-[#C8C8D8] hover:text-white hover:border-[#D4AF37]/50 transition-colors"
                        >
                          Draft First (Free)
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePlanCode(plan.code)}
                          className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors ${
                            inCart
                              ? 'bg-[#D4AF37]/20 text-[#ECC86A] border border-[#D4AF37]/60'
                              : 'border border-[#2B2B3C] text-[#8E8EA2] hover:text-[#ECC86A]'
                          }`}
                        >
                          {inCart ? 'In Quote ✓' : '+ Add to Quote'}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8A8A9C] border-t border-[#1D1D28] pt-3 leading-relaxed">
                      {plan.thirdPartyDisclosure}
                    </p>
                  </div>
                );
              })}
          </div>

          {/* Stage 3 Modules 10 & 11: Selectable Add-Ons + Server-Validated Shopping Cart & Locked Quotation Builder */}
          <div className="rounded-xl border border-[#242434] bg-[#0D0D13] p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-luxury text-xl font-semibold text-white">
                    Platform Package Cart &amp; Add-On Builder
                  </h3>
                  <p className="text-xs text-[#9E9EB2] mt-1">
                    All prices are validated server-side from Cloudflare D1 edge database. Toggle add-ons to build a transparent GST quotation.
                  </p>
                </div>
                <div className="inline-flex rounded-md border border-[#2A2A38] bg-[#08080C] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`px-3 py-1 rounded ${billingPeriod === 'monthly' ? 'bg-[#D4AF37] text-[#08080A] font-semibold' : 'text-[#A3A3B5]'}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('yearly')}
                    className={`px-3 py-1 rounded ${billingPeriod === 'yearly' ? 'bg-[#D4AF37] text-[#08080A] font-semibold' : 'text-[#A3A3B5]'}`}
                  >
                    Yearly (-15% Recurring)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {plans
                  .filter((p) => p.active && (p.category === 'addon' || p.category === 'addon_ai' || p.category === 'addon_storage'))
                  .map((addon) => {
                    const checked = selectedPlanCodes.includes(addon.code);
                    return (
                      <label
                        key={addon.id}
                        className={`flex items-start justify-between gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked ? 'border-[#D4AF37] bg-[#16130B]' : 'border-[#1F1F2D] bg-[#09090D] hover:border-[#323246]'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePlanCode(addon.code)}
                            className="accent-[#D4AF37] mt-0.5"
                          />
                          <div>
                            <p className="text-white font-medium">{addon.name}</p>
                            <p className="text-[10px] text-[#8E8EA2] capitalize">{addon.billingCycle.replace('_', ' ')}</p>
                          </div>
                        </div>
                        <span className="font-mono-tabular text-[#ECC86A] font-semibold whitespace-nowrap">
                          ₹{addon.priceInr.toLocaleString('en-IN')}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-[#20202E] pt-6 lg:pt-0 lg:pl-8 space-y-4 text-xs">
              <div>
                <p className="text-[#ECC86A] font-semibold mb-2">Server-Validated Quotation Summary</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border-b border-[#1E1E2B] pb-3">
                  {(serverCalc?.items || []).map((it) => (
                    <div key={it.code} className="flex justify-between gap-2">
                      <span className="text-[#CFCFDA] truncate">
                        {it.name} <span className="text-[10px] text-[#7E7E92]">({it.cycleLabel})</span>
                      </span>
                      <span className="font-mono-tabular text-white">₹{it.lineTotalInr.toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 pt-3 font-mono-tabular">
                  <div className="flex justify-between text-[#9E9EB2]">
                    <span>One-Time Setup Subtotal</span>
                    <span>₹{(serverCalc?.oneTimeSubtotalInr ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-[#9E9EB2]">
                    <span>Recurring Subtotal ({billingPeriod})</span>
                    <span>₹{(serverCalc?.recurringSubtotalInr ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-[#9E9EB2]">
                    <span>GST (18%)</span>
                    <span>₹{(serverCalc?.gstInr ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-[#ECC86A] pt-2 border-t border-[#1E1E2B]">
                    <span>Grand Total (Incl. GST)</span>
                    <span>₹{(serverCalc?.grandTotalInr ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {selectedPlanCodes.length > 0 && (() => {
                  const primaryPlan =
                    plans.find((p) => p.code === selectedPlanCodes[0] && p.category !== 'addon') ||
                    plans.find((p) => p.code === 'business-website') ||
                    plans[0];
                  return primaryPlan ? (
                    <button
                      type="button"
                      onClick={() => handleOpenBuyNow(primaryPlan)}
                      className="w-full mt-3 py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-95 shadow-sm transition-opacity"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Buy {primaryPlan.name} (₹{primaryPlan.priceInr.toLocaleString('en-IN')})</span>
                    </button>
                  ) : null;
                })()}

                <p className="text-[10px] text-[#858599] mt-2 leading-relaxed">
                  {serverCalc?.thirdPartyNote ||
                    'Excludes third-party domain registration/renewal, Razorpay MDR, WhatsApp Business API, and external hosting renewals.'}
                </p>
              </div>

              {lockedProposal ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-2">
                  <p className="font-mono-tabular font-semibold text-emerald-300">
                    Locked Quotation Saved: {lockedProposal.proposalNumber}
                  </p>
                  <p className="text-[11px] text-[#D5D5E2]">
                    Grand Total: ₹{lockedProposal.grandTotalInr.toLocaleString('en-IN')} (incl. ₹
                    {lockedProposal.gstInr.toLocaleString('en-IN')} GST). Prices are locked and ready in your Dashboards tab.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 rounded border border-[#2A2A38] text-white"
                    >
                      Print / PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('builder')}
                      className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold"
                    >
                      Launch Website Builder
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLockProposal} className="space-y-2 pt-2 border-t border-[#1E1E2B]">
                  <p className="font-semibold text-white">Save &amp; Lock Official Quotation</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" required value={propName} onChange={(e) => setPropName(e.target.value)} placeholder="Your Name" className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white" />
                    <input type="text" required value={propBiz} onChange={(e) => setPropBiz(e.target.value)} placeholder="Business Name" className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white" />
                    <input type="email" required value={propEmail} onChange={(e) => setPropEmail(e.target.value)} placeholder="Email" className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white" />
                    <input type="tel" required value={propPhone} onChange={(e) => setPropPhone(e.target.value)} placeholder="Phone / WhatsApp" className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white" />
                  </div>
                  <button
                    type="submit"
                    disabled={propBusy}
                    className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
                  >
                    {propBusy ? 'Locking Quotation...' : 'Generate Locked Quotation (18% GST)'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Module 14: Guided Customer Publishing Journey */}
          <div className="mt-10 rounded-xl border border-[#1E1E2B] bg-[#0B0B11] p-6">
            <p className="text-xs font-semibold text-[#D4AF37] mb-1">Guided 14-Step Launch Workflow</p>
            <h3 className="font-luxury text-lg font-semibold text-white mb-4">
              From Registration to Live Business Storefront &amp; Google Search Visibility
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-[11px]">
              {[
                '1. Sign In',
                '2. Select Package',
                '3. Choose Industry',
                '4. Pick Template',
                '5. Brand & Colors',
                '6. Add Catalog',
                '7. Preview Subdomain',
                '8. Connect Domain',
                '9. Verify DNS & SSL',
                '10. Configure SEO',
                '11. Enable Payments',
                '12. Setup Delivery',
                '13. Publish Live',
                '14. Track Orders & AI',
              ].map((step) => (
                <div key={step} className="rounded border border-[#1F1F2D] bg-[#0E0E15] px-2.5 py-2 text-[#CFCFDA]">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Made in India Trust, Public Template Gallery, Free SEO Audit, Blog & Referral Program */}
      <GlobalGrowthHub lang={lang} onNavigate={onNavigate} onNotify={onNotify} />

      {/* FAQs & Contact Form */}
      <section id="contact" className="py-16 md:py-24 border-b border-[#1D1D26]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <p className="text-xs font-medium text-[#D4AF37] mb-2">Clarity & Transparency</p>
              <h2 className="font-luxury text-2xl md:text-3xl font-bold text-white">
                Frequently Asked Questions
              </h2>
            </div>
            <div className="space-y-4">
              {FAQS.map((faq) => (
                <div key={faq.q} className="rounded-lg border border-[#20202D] bg-[#0D0D13] p-5">
                  <h3 className="text-sm font-semibold text-white mb-1.5">{faq.q}</h3>
                  <p className="text-xs text-[#A3A3B5] leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-xl border border-[#222230] bg-[#0E0E14] p-6 md:p-8">
              <h3 className="font-luxury text-xl font-semibold text-white mb-1">
                Start a Project or Request Custom Package
              </h3>
              <p className="text-xs text-[#9A9AAE] mb-6">
                Saved directly to the Vijay Visuals Admin Support Desk or connect instantly on WhatsApp ({CONTACT_INFO.whatsappDisplay}).
              </p>
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#A7A7B8] mb-1">Your Name</label>
                    <input
                      type="text"
                      required
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A7A7B8] mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#A7A7B8] mb-1">Phone / WhatsApp</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#A7A7B8] mb-1">Subject</label>
                    <input
                      type="text"
                      value={contactSubject}
                      onChange={(e) => setContactSubject(e.target.value)}
                      className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#A7A7B8] mb-1">Business Requirements</label>
                  <textarea
                    rows={4}
                    required
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Tell us your business category, website-only or optional PWA preference, and timeline..."
                    className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingContact}
                  className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingContact ? 'Submitting...' : 'Submit Inquiry'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer with Consent-Based Newsletter */}
      <footer className="bg-[#060609] py-12 text-xs text-[#8B8B9E]">
        <div className="max-w-7xl mx-auto px-6 space-y-8">
          <div className="rounded-lg border border-[#1B1B26] bg-[#0B0B11] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold">Vijay Visuals Product Updates &amp; Growth Tips</p>
              <p className="text-[11px] text-[#858599]">Explicit opt-in only. Zero spam — unsubscribe anytime.</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!platNewsConsent) {
                  onNotify('Please confirm your explicit opt-in consent checkbox first.');
                  return;
                }
                try {
                  await apiFetch('/api/newsletter/subscribe', {
                    method: 'POST',
                    body: JSON.stringify({
                      email: platNewsEmail.trim(),
                      source: 'vijay_visuals_landing',
                      consentGiven: true,
                    }),
                  });
                  setPlatNewsEmail('');
                  setPlatNewsConsent(false);
                  onNotify('Subscribed to Vijay Visuals updates!');
                } catch (err) {
                  onNotify(err instanceof Error ? err.message : 'Subscription failed.');
                }
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="email"
                required
                value={platNewsEmail}
                onChange={(e) => setPlatNewsEmail(e.target.value)}
                placeholder="you@business.in"
                className="rounded border border-[#282838] bg-[#08080C] px-3 py-1.5 text-white"
              />
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#9A9AAE] cursor-pointer">
                <input
                  type="checkbox"
                  checked={platNewsConsent}
                  onChange={(e) => setPlatNewsConsent(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>I opt in</span>
              </label>
              <button type="submit" className="px-3.5 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold">
                Subscribe
              </button>
            </form>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="font-luxury text-base font-bold tracking-widest text-white">VIJAY VISUALS</p>
              <p className="mt-1 text-[#7D7D90]">
                Multi-Tenant Business Platform &amp; Creative Studio · {CONTACT_INFO.location}
              </p>
              <p className="mt-1 text-[11px] text-[#6A6A7C]">
                Third-party domain, cloud hosting, payment gateway, and messaging API fees apply separately. Optional PWA is a browser-installable web app, not a Play Store app.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-[#ECC86A]">
                Sitemap
              </a>
              <a href={CONTACT_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#ECC86A]">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{CONTACT_INFO.whatsappDisplay}</span>
              </a>
              <a href={CONTACT_INFO.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#ECC86A]">
                <Instagram className="w-3.5 h-3.5" />
                <span>@{CONTACT_INFO.instagram}</span>
              </a>
              <a href={`mailto:${CONTACT_INFO.email}`} className="inline-flex items-center gap-1.5 hover:text-[#ECC86A]">
                <Mail className="w-3.5 h-3.5" />
                <span>{CONTACT_INFO.email}</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Package Purchase Order Summary & Checkout Modal */}
      {buyingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-xl border border-[#2B2B3E] bg-[#0E0E15] p-6 text-xs text-[#E4E4EE] shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => !purchasing && setBuyingPlan(null)}
              disabled={purchasing}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-1.5 rounded-md text-[#8E8EA2] hover:text-white hover:bg-[#1A1A26] transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="font-luxury text-lg font-bold text-white">Review Order Summary &amp; Checkout</h2>
            </div>
            <p className="text-[#9E9EB2] text-[11px] mb-4">
              Secure Vijay Visuals Platform Purchase · Server-Side Verified by Razorpay
            </p>

            {/* Selected Package Details */}
            <div className="rounded-lg border border-[#232332] bg-[#12121B] p-4 mb-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#D4AF37]/20 text-[#ECC86A] mb-1">
                    {buyingPlan.category.toUpperCase()} PACKAGE
                  </span>
                  <h3 className="font-luxury text-base font-bold text-white">{buyingPlan.name}</h3>
                  <p className="text-[11px] text-[#A2A2B6]">Full website management access</p>
                </div>
                <div className="text-right">
                  <p className="font-mono-tabular text-xl font-bold text-[#ECC86A]">
                    ₹{buyingPlan.priceInr.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-[#7A7A8E]">+ 18% GST</p>
                </div>
              </div>

              {/* Price Calculation Breakdown */}
              <div className="border-t border-[#1E1E2C] pt-2.5 space-y-1.5 font-mono-tabular text-[11px]">
                <div className="flex justify-between text-[#A0A0B4]">
                  <span>Package Base Price:</span>
                  <span>₹{buyingPlan.priceInr.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-[#A0A0B4]">
                  <span>GST (18% Goods &amp; Services Tax):</span>
                  <span>₹{Math.round(buyingPlan.priceInr * 0.18).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-[#1E1E2C]">
                  <span>Total Amount Payable:</span>
                  <span className="text-[#ECC86A]">
                    ₹{Math.round(buyingPlan.priceInr * 1.18).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* What is Included */}
            <div className="rounded-lg border border-[#20202F] bg-[#0A0A0F] p-3 mb-4 space-y-2">
              <p className="font-semibold text-[#D4AF37] text-[11px]">Package Entitlements Included:</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-[#C2C2D4]">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Full website builder &amp; design</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Product, catalog &amp; pricing</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Orders, invoices &amp; customers</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Photos, banners &amp; gallery</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Publish &amp; unpublish controls</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Custom domain connection</span>
                </li>
              </ul>
            </div>

            {/* Important Package Boundaries & Third-Party Disclosures */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 mb-4 text-[10px] text-[#C4B79A] leading-relaxed space-y-1">
              <p className="font-semibold text-amber-300">Important Package Boundaries:</p>
              <p>• <strong>Custom Domain:</strong> Customer provides and owns their own domain (e.g. from Cloudflare or GoDaddy). Domain registration &amp; renewal fees are paid directly to your registrar.</p>
              <p>• <strong>Hosting:</strong> Platform edge hosting is included under the verified hosting arrangement.</p>
              <p>• <strong>Payment Gateway:</strong> Seller receives customer payments through the seller's separately configured Razorpay / UPI gateway. Gateway MDR charges apply directly.</p>
            </div>

            {/* Customer Prefill Summary */}
            <div className="border border-[#1E1E2C] rounded-lg p-2.5 mb-5 bg-[#0A0A0F] flex items-center justify-between text-[11px]">
              <div>
                <span className="text-[#8E8EA0]">Billed to: </span>
                <span className="text-white font-medium">{profile?.name || 'Customer'}</span>
                <span className="text-[#8E8EA0]"> ({profile?.email || 'Signed-in account'})</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-medium">✓ Verified Account</span>
            </div>

            {/* Modal Actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConfirmPurchase}
                disabled={purchasing}
                className="w-full py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Opening Razorpay Secure Checkout...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>
                      Proceed to Razorpay Checkout (₹{Math.round(buyingPlan.priceInr * 1.18).toLocaleString('en-IN')})
                    </span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBuyingPlan(null);
                    onNavigate('builder');
                  }}
                  disabled={purchasing}
                  className="w-full py-2 rounded-md border border-[#2B2B3C] text-[11px] font-medium text-[#B8B8CA] hover:text-white hover:border-[#D4AF37]/50 transition-colors disabled:opacity-50"
                >
                  Customize Draft in Builder First
                </button>
                <button
                  type="button"
                  onClick={() => !purchasing && setBuyingPlan(null)}
                  disabled={purchasing}
                  className="w-full py-2 rounded-md border border-[#2B2B3C] text-[11px] font-medium text-[#8E8EA0] hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
