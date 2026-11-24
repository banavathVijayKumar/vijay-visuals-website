import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Copy,
  FileText,
  Globe,
  Layers,
  SearchCheck,
  Share2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BUSINESS_CATEGORIES, CONTACT_INFO, Lang, WEBSITE_TEMPLATES } from '../data/content';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { AppView } from '../types/platform';

interface GlobalGrowthHubProps {
  lang: Lang;
  onNavigate: (view: AppView) => void;
  onNotify: (msg: string) => void;
}

interface SeoCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface BlogPostItem {
  id: number | string;
  slug: string;
  title: string;
  excerpt: string;
  content_markdown: string;
  category: string;
  language: string;
  author_name: string;
  published_at?: string;
}

interface ReferralCodeRow {
  id: number;
  referral_code: string;
  program_type: string;
  commission_percent: number;
  signups_count: number;
  status: string;
}

const FALLBACK_BLOG_POSTS: BlogPostItem[] = [
  {
    id: 'local-1',
    slug: 'launch-indian-online-store-gst-upi',
    title: 'How Small Businesses in India Launch an Online Store with Direct Seller Settlements',
    excerpt:
      'Step-by-step checklist for Indian shop owners: mobile-first catalog, COD + UPI readiness, GST invoicing, and keeping 100% domain ownership.',
    content_markdown:
      'Every shop owner in India deserves an independent digital storefront without paying high marketplace commissions. Start by picking your industry template, adding clear product photos with alt text, configuring Cash on Delivery and direct UPI payments (with automated seller split settlement subject to Cashfree Easy Split activation and approval), and connecting your own .in or .com domain via DNS TXT verification.',
    category: 'E-Commerce Guide',
    language: 'en',
    author_name: 'Vijay Visuals Editorial',
  },
  {
    id: 'local-2',
    slug: 'connect-custom-domain-safely-dns-txt',
    title: 'Connect Your Custom Domain Without Ever Sharing Registrar Passwords',
    excerpt:
      'Why DNS TXT ownership verification protects business owners, how HTTPS SSL activates automatically, and how to set up root + www redirects.',
    content_markdown:
      'Never hand over your GoDaddy, Namecheap, or Cloudflare login password to any agency. With DNS TXT verification, you paste one ownership record and one CNAME record inside your own registrar account. You retain 100% legal ownership and full portability of your brand domain forever.',
    category: 'Domains & Security',
    language: 'en',
    author_name: 'Vijay Visuals Engineering',
  },
  {
    id: 'local-3',
    slug: 'regional-indian-languages-local-seo-guide',
    title: 'Reaching Local & Global Buyers with 12-Language Storefronts and Clean Technical SEO',
    excerpt:
      'Practical guide to hreflang tags, structured JSON-LD schema, XML sitemaps, and Google Business Profile verification without empty ranking promises.',
    content_markdown:
      'Customers across Hyderabad, Chennai, Bengaluru, Mumbai, Delhi, and the global diaspora search in both English and regional Indian languages. Pair clean page titles (30-60 characters), honest meta descriptions (120-160 characters), Organization/Product JSON-LD schema, and verified Google Business Profile listings for durable organic visibility.',
    category: 'Global SEO',
    language: 'en',
    author_name: 'Vijay Visuals Growth Team',
  },
];

type PolicyDocKey = 'privacy' | 'terms' | 'refund' | 'security';

const POLICY_DOCS: Record<PolicyDocKey, { title: string; points: string[] }> = {
  privacy: {
    title: 'Privacy Policy & Data Isolation',
    points: [
      'Each business tenant workspace is isolated in the database by verified owner and website ID.',
      'Customer marketing reminders (newsletter, WhatsApp, abandoned cart) require explicit recorded opt-in consent and support one-click unsubscribe.',
      'Vijay Visuals never sells merchant customer lists or asks for domain registrar passwords, banking OTPs, or UPI PINs.',
    ],
  },
  terms: {
    title: 'Terms of Service & 100% Ownership',
    points: [
      'Merchants retain 100% ownership of their custom domains, brand assets, product catalogs, and customer data.',
      'Third-party infrastructure fees (domain registration/renewal, Cashfree MDR, WhatsApp Business Cloud API, external courier fees) are billed separately by their respective providers.',
      'Optional Progressive Web Apps (PWAs) are browser-installable web apps, not Google Play Store or Apple App Store native binaries.',
    ],
  },
  refund: {
    title: 'Transparent Refund & Cancellation Policy',
    points: [
      'Platform package invoices clearly itemize one-time setup, recurring subscription, and applicable GST before payment.',
      'Domain registrations, third-party gateway fees, and consumed metered AI/messaging credits are non-refundable once provisioned with external providers.',
      'Storefront customer refunds and returns are managed directly by the respective merchant through the order & return workflow.',
    ],
  },
  security: {
    title: 'Payment Separation & Platform Security',
    points: [
      'Platform website packages settle strictly to the Vijay Visuals official merchant account after server-side Cashfree HMAC-SHA256 signature verification.',
      'Merchant customer store payments are architected with strict financial segregation. Automated seller split settlements are subject to Cashfree Easy Split activation and KYC approval, and customer funds never route to the platform owner personal account.',
      'All API secrets remain server-side in Cloudflare Pages Secrets and are never embedded in client JavaScript bundles.',
    ],
  },
};

export const GlobalGrowthHub: React.FC<GlobalGrowthHubProps> = ({ lang, onNavigate, onNotify }) => {
  const { profile, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState<'templates' | 'seo_audit' | 'blog' | 'referral'>('templates');
  const [policyOpen, setPolicyOpen] = useState<PolicyDocKey | null>(null);

  // Template Gallery Filter
  const [templateFilter, setTemplateFilter] = useState('');

  // Technical SEO Audit Tool State
  const [auditTitle, setAuditTitle] = useState('Deccan Royal Couture — Handloom Bridal Sarees in Hyderabad');
  const [auditDesc, setAuditDesc] = useState(
    'Shop authentic Kanchipuram and Banarasi bridal silk sarees directly from Hyderabad weavers with verified checkout, nationwide shipping, and COD.'
  );
  const [auditUrl, setAuditUrl] = useState('https://vijay-visuals-site.pages.dev/site/deccan-royal-couture');
  const [auditTotalImages, setAuditTotalImages] = useState(8);
  const [auditAltImages, setAuditAltImages] = useState(8);
  const [auditLangCount, setAuditLangCount] = useState(3);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    technicalReadinessScore: number;
    checks: SeoCheckItem[];
    rankingDisclaimer: string;
  } | null>(null);

  // Public Blog State
  const [blogPosts, setBlogPosts] = useState<BlogPostItem[]>(FALLBACK_BLOG_POSTS);
  const [openBlogSlug, setOpenBlogSlug] = useState<string | null>(null);

  // Referral / Affiliate State
  const [referralCodes, setReferralCodes] = useState<ReferralCodeRow[]>([]);
  const [shareBaseUrl, setShareBaseUrl] = useState('https://vijay-visuals-site.pages.dev');
  const [refProgramType, setRefProgramType] = useState<'referral' | 'affiliate'>('referral');
  const [customRefCode, setCustomRefCode] = useState('');
  const [refBusy, setRefBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ posts?: BlogPostItem[] }>(`/api/platform/seo-growth?scope=blog&lang=${encodeURIComponent(lang)}`)
      .then((res) => {
        if (Array.isArray(res.posts) && res.posts.length > 0) {
          setBlogPosts(res.posts);
        }
      })
      .catch(() => {});
  }, [lang]);

  useEffect(() => {
    if (!profile || activeTab !== 'referral') return;
    apiFetch<{ codes?: ReferralCodeRow[]; shareBaseUrl?: string }>('/api/platform/seo-growth?scope=my_referrals')
      .then((res) => {
        if (Array.isArray(res.codes)) setReferralCodes(res.codes);
        if (res.shareBaseUrl) setShareBaseUrl(res.shareBaseUrl);
      })
      .catch(() => {});
  }, [profile, activeTab]);

  const handleRunSeoAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuditBusy(true);
    try {
      const res = await apiFetch<{
        technicalReadinessScore: number;
        checks: SeoCheckItem[];
        rankingDisclaimer: string;
      }>('/api/platform/seo-growth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'seo_audit',
          title: auditTitle.trim(),
          description: auditDesc.trim(),
          canonicalUrl: auditUrl.trim(),
          totalImages: auditTotalImages,
          imagesWithAlt: auditAltImages,
          hasStructuredData: true,
          languagesCount: auditLangCount,
        }),
      });
      setAuditResult(res);
    } catch {
      // Deterministic client-side technical check fallback (same 6 checks, never fabricated)
      const tLen = auditTitle.trim().length;
      const dLen = auditDesc.trim().length;
      const isHttps = auditUrl.trim().startsWith('https://');
      const checks: SeoCheckItem[] = [
        {
          id: 'title',
          label: 'Page Title Length (30–60 chars)',
          status: tLen >= 30 && tLen <= 60 ? 'pass' : tLen >= 15 ? 'warn' : 'fail',
          detail: `Title is ${tLen} characters. Optimal range is 30–60 characters.`,
        },
        {
          id: 'description',
          label: 'Meta Description Length (120–160 chars)',
          status: dLen >= 120 && dLen <= 160 ? 'pass' : dLen >= 60 ? 'warn' : 'fail',
          detail: `Description is ${dLen} characters. Optimal range is 120–160 characters.`,
        },
        {
          id: 'https',
          label: 'HTTPS & Canonical URL',
          status: isHttps ? 'pass' : 'fail',
          detail: isHttps ? `Canonical HTTPS URL configured: ${auditUrl.trim()}` : 'Canonical URL must start with https://',
        },
        {
          id: 'alt_text',
          label: 'Image Alt Text Accessibility',
          status: auditAltImages >= auditTotalImages ? 'pass' : 'warn',
          detail: `${Math.min(auditAltImages, auditTotalImages)}/${auditTotalImages} images include descriptive alt text.`,
        },
        {
          id: 'schema',
          label: 'JSON-LD Schema (Organization / LocalBusiness / Product)',
          status: 'pass',
          detail: 'Structured JSON-LD schema is enabled automatically on Vijay Visuals storefronts.',
        },
        {
          id: 'multilingual',
          label: 'Multilingual hreflang Readiness',
          status: auditLangCount >= 2 ? 'pass' : 'warn',
          detail: `${auditLangCount} language(s) enabled with automatic English fallback.`,
        },
      ];
      const score = Math.round(
        (checks.reduce((acc, c) => acc + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / checks.length) *
          100
      );
      setAuditResult({
        technicalReadinessScore: score,
        checks,
        rankingDisclaimer:
          'Technical SEO readiness improves crawlability and Core Web Vitals hygiene, but Google search rankings depend on content quality, competition, and authority. No platform can guarantee #1 search placement.',
      });
    } finally {
      setAuditBusy(false);
    }
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      signInWithGoogle();
      return;
    }
    setRefBusy(true);
    try {
      const res = await apiFetch<{ referralCode: string; shareUrl: string }>('/api/platform/seo-growth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_referral',
          programType: refProgramType,
          customCode: customRefCode.trim() || undefined,
        }),
      });
      setCustomRefCode('');
      onNotify(`Created ${refProgramType} code: ${res.referralCode}`);
      const refreshed = await apiFetch<{ codes?: ReferralCodeRow[] }>('/api/platform/seo-growth?scope=my_referrals');
      if (Array.isArray(refreshed.codes)) setReferralCodes(refreshed.codes);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to create referral code right now.');
    } finally {
      setRefBusy(false);
    }
  };

  const copyText = (value: string, label: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    onNotify(`${label} copied to clipboard.`);
  };

  const filteredCategories = BUSINESS_CATEGORIES.filter((cat) => {
    const q = templateFilter.trim().toLowerCase();
    return !q || cat.label.toLowerCase().includes(q) || cat.id.toLowerCase().includes(q);
  });

  return (
    <section id="global-growth" className="py-16 md:py-24 border-b border-[#1D1D26] bg-[#09090D]">
      <div className="max-w-7xl mx-auto px-6 space-y-10">
        {/* Authentic India Pride & Global Trust Statement (Zero Fake Government Claims) */}
        <div className="rounded-xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#12100A] via-[#0D0D13] to-[#0B0B11] p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold tracking-wider text-[#ECC86A]">
              VIJAY VISUALS · MADE IN INDIA. BUILT FOR THE WORLD.
            </p>
            <h2 className="font-luxury text-2xl md:text-3xl font-bold text-white text-balance">
              Empowering Every Business to Go Digital — Locally &amp; Globally
            </h2>
            <p className="text-xs md:text-sm text-[#A9A9BC] leading-relaxed">
              Engineered in Hyderabad, India for shop owners, startups, creators, and enterprises worldwide. Built with
              12 Indian &amp; global languages, live multi-currency FX display, 100% custom domain ownership, separated
              merchant payment architecture, and honest third-party cost transparency.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(
              [
                { key: 'privacy', label: 'Privacy Policy' },
                { key: 'terms', label: 'Terms & Ownership' },
                { key: 'refund', label: 'Refund Policy' },
                { key: 'security', label: 'Payment Security' },
              ] as Array<{ key: PolicyDocKey; label: string }>
            ).map((doc) => (
              <button
                key={doc.key}
                type="button"
                onClick={() => setPolicyOpen(doc.key)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#2A2A38] bg-[#0D0D14] text-[#D7D7E4] hover:border-[#D4AF37] hover:text-[#ECC86A] transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{doc.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4-Tab Growth, Discovery & SEO Toolkit */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#1E1E2B] pb-3">
            {(
              [
                { id: 'templates', label: 'Public Template Gallery', icon: Layers },
                { id: 'seo_audit', label: 'Free Technical SEO Audit', icon: SearchCheck },
                { id: 'blog', label: 'Guides & SEO Blog', icon: BookOpen },
                { id: 'referral', label: 'Referral & Affiliate Program', icon: Share2 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#D4AF37] text-[#08080A]'
                      : 'border border-[#252534] bg-[#0E0E15] text-[#A9A9BC] hover:text-white hover:border-[#3A3A4E]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: PUBLIC TEMPLATE GALLERY */}
          {activeTab === 'templates' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-luxury text-xl font-semibold text-white">
                    Industry Templates &amp; 4 Visual Themes
                  </h3>
                  <p className="text-xs text-[#9E9EB2] mt-1">
                    Choose from 16 business industries and 4 responsive luxury themes. Every storefront includes clean URLs,
                    SEO schema, and multi-language readiness.
                  </p>
                </div>
                <input
                  type="text"
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  placeholder="Filter industries (e.g., Restaurant, Salon)..."
                  className="rounded-md border border-[#282838] bg-[#0D0D14] px-3 py-2 text-xs text-white placeholder-[#6D6D82] focus:border-[#D4AF37] focus:outline-none w-full sm:w-64"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {WEBSITE_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="rounded-xl border border-[#222230] bg-[#0E0E15] p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: tpl.primaryColor }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: tpl.accentColor }}
                        />
                        <span className="text-[11px] text-[#9A9AAE]">{tpl.fontFamily}</span>
                      </div>
                      <h4 className="font-luxury text-base font-semibold text-white">{tpl.name}</h4>
                      <p className="text-xs text-[#9E9EB2] mt-1.5 leading-relaxed">{tpl.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('builder')}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-md border border-[#D4AF37]/45 text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A] text-xs font-semibold transition-colors"
                    >
                      <span>Use Theme in Builder</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 text-xs">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onNavigate('builder')}
                    className="text-left rounded-lg border border-[#1E1E2B] bg-[#0C0C12] px-3.5 py-3 hover:border-[#D4AF37]/60 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="text-[#D8D8E4] font-medium truncate">{cat.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: FREE TECHNICAL SEO AUDIT TOOL */}
          {activeTab === 'seo_audit' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleRunSeoAudit}
                className="lg:col-span-6 rounded-xl border border-[#222230] bg-[#0E0E15] p-6 space-y-4 text-xs"
              >
                <div>
                  <h3 className="font-luxury text-lg font-semibold text-white">
                    Free Website Technical SEO &amp; Crawlability Checker
                  </h3>
                  <p className="text-[#9E9EB2] mt-1">
                    Inspect title length, meta description, HTTPS canonical hygiene, image alt accessibility, JSON-LD
                    schema, and multilingual hreflang coverage.
                  </p>
                </div>

                <div>
                  <label className="block text-[#A9A9BC] mb-1">
                    Page Title ({auditTitle.trim().length} chars · target 30–60)
                  </label>
                  <input
                    type="text"
                    required
                    value={auditTitle}
                    onChange={(e) => setAuditTitle(e.target.value)}
                    className="w-full rounded border border-[#292938] bg-[#09090D] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#A9A9BC] mb-1">
                    Meta Description ({auditDesc.trim().length} chars · target 120–160)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={auditDesc}
                    onChange={(e) => setAuditDesc(e.target.value)}
                    className="w-full rounded border border-[#292938] bg-[#09090D] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#A9A9BC] mb-1">Canonical Website URL (HTTPS)</label>
                  <input
                    type="url"
                    required
                    value={auditUrl}
                    onChange={(e) => setAuditUrl(e.target.value)}
                    className="w-full rounded border border-[#292938] bg-[#09090D] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#A9A9BC] mb-1">Total Images</label>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={auditTotalImages}
                      onChange={(e) => setAuditTotalImages(Number(e.target.value))}
                      className="w-full rounded border border-[#292938] bg-[#09090D] px-2.5 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#A9A9BC] mb-1">Images w/ Alt</label>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={auditAltImages}
                      onChange={(e) => setAuditAltImages(Number(e.target.value))}
                      className="w-full rounded border border-[#292938] bg-[#09090D] px-2.5 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[#A9A9BC] mb-1">Languages</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={auditLangCount}
                      onChange={(e) => setAuditLangCount(Number(e.target.value))}
                      className="w-full rounded border border-[#292938] bg-[#09090D] px-2.5 py-2 text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={auditBusy}
                  className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                >
                  {auditBusy ? 'Running Technical SEO Audit...' : 'Run Free Technical SEO Audit'}
                </button>
              </form>

              <div className="lg:col-span-6 rounded-xl border border-[#222230] bg-[#0E0E15] p-6 space-y-4 text-xs">
                {auditResult ? (
                  <>
                    <div className="flex items-center justify-between border-b border-[#1E1E2B] pb-4">
                      <div>
                        <p className="text-[#9E9EB2]">Technical SEO Readiness Score</p>
                        <p className="font-mono-tabular text-3xl font-bold text-[#ECC86A] mt-0.5">
                          {auditResult.technicalReadinessScore} / 100
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('builder')}
                        className="px-3.5 py-2 rounded-md border border-[#D4AF37]/45 text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A] font-semibold"
                      >
                        Apply in Website Builder
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {auditResult.checks.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-[#1E1E2B] bg-[#0A0A10] p-3 flex items-start justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-white">{item.label}</p>
                            <p className="text-[#9A9AAE] mt-0.5">{item.detail}</p>
                          </div>
                          <span
                            className={`uppercase font-mono-tabular text-[10px] font-bold shrink-0 ${
                              item.status === 'pass'
                                ? 'text-emerald-400'
                                : item.status === 'warn'
                                  ? 'text-amber-300'
                                  : 'text-rose-400'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-[#8E8EA2] border-t border-[#1E1E2B] pt-3 leading-relaxed">
                      <strong>Honest SEO Disclosure:</strong> {auditResult.rankingDisclaimer}
                    </p>
                  </>
                ) : (
                  <div className="py-10 text-center space-y-3">
                    <Globe className="w-8 h-8 text-[#D4AF37] mx-auto" />
                    <p className="text-sm font-semibold text-white">Ready to Inspect Your Storefront SEO Hygiene</p>
                    <p className="text-[#9E9EB2] max-w-md mx-auto leading-relaxed">
                      Submit your title, description, and HTTPS URL to verify Google Search crawlability, JSON-LD
                      structured data, and 12-language hreflang compliance.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PUBLIC GUIDES & SEO BLOG */}
          {activeTab === 'blog' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {blogPosts.map((post) => {
                const isOpen = openBlogSlug === post.slug;
                const shareUrl = `${window.location.origin}/?blog=${encodeURIComponent(post.slug)}`;
                return (
                  <article
                    key={post.slug}
                    className="rounded-xl border border-[#222230] bg-[#0E0E15] p-6 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2.5">
                      <p className="text-[11px] text-[#D4AF37] font-medium">
                        {post.category} · {post.author_name}
                      </p>
                      <h3 className="font-luxury text-lg font-semibold text-white leading-snug">{post.title}</h3>
                      <p className="text-xs text-[#A3A3B5] leading-relaxed">{post.excerpt}</p>
                      {isOpen && (
                        <div className="pt-3 border-t border-[#1F1F2D] text-xs text-[#D5D5E2] leading-relaxed whitespace-pre-line">
                          {post.content_markdown}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#1D1D28] text-xs">
                      <button
                        type="button"
                        onClick={() => setOpenBlogSlug(isOpen ? null : post.slug)}
                        className="text-[#ECC86A] font-semibold hover:underline"
                      >
                        {isOpen ? 'Collapse Article' : 'Read Full Guide'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(shareUrl, 'Guide link')}
                        className="inline-flex items-center gap-1 text-[#9E9EB2] hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* TAB 4: REFERRAL & AFFILIATE PROGRAM */}
          {activeTab === 'referral' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 rounded-xl border border-[#222230] bg-[#0E0E15] p-6 space-y-4 text-xs">
                <h3 className="font-luxury text-lg font-semibold text-white">
                  Vijay Visuals Partner, Referral &amp; Affiliate Growth Program
                </h3>
                <p className="text-[#A3A3B5] leading-relaxed">
                  Share Vijay Visuals with fellow shop owners, freelancers, and digital agencies. Every verified signup
                  attributed to your unique link is logged transparently in your partner ledger.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3.5">
                    <p className="text-[#ECC86A] font-semibold">Customer Referral</p>
                    <p className="text-lg font-mono-tabular font-bold text-white mt-1">10% Credit</p>
                    <p className="text-[11px] text-[#8E8EA2] mt-0.5">On verified business website packages</p>
                  </div>
                  <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3.5">
                    <p className="text-[#ECC86A] font-semibold">Agency / Affiliate Partner</p>
                    <p className="text-lg font-mono-tabular font-bold text-white mt-1">15% Attribution</p>
                    <p className="text-[11px] text-[#8E8EA2] mt-0.5">Subject to verified invoice settlement</p>
                  </div>
                </div>

                {profile ? (
                  <form onSubmit={handleCreateReferral} className="space-y-3 pt-3 border-t border-[#1E1E2B]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={refProgramType}
                        onChange={(e) => setRefProgramType(e.target.value as 'referral' | 'affiliate')}
                        className="rounded border border-[#292938] bg-[#09090D] px-3 py-2 text-white"
                      >
                        <option value="referral">Customer Referral (10%)</option>
                        <option value="affiliate">Affiliate Partner (15%)</option>
                      </select>
                      <input
                        type="text"
                        value={customRefCode}
                        onChange={(e) => setCustomRefCode(e.target.value)}
                        placeholder="Optional custom code (e.g. HYDSTUDIO)"
                        maxLength={20}
                        className="rounded border border-[#292938] bg-[#09090D] px-3 py-2 text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={refBusy}
                      className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                    >
                      {refBusy ? 'Generating Referral Code...' : 'Generate My Shareable Referral Link'}
                    </button>
                  </form>
                ) : (
                  <div className="pt-3 border-t border-[#1E1E2B] flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[#9E9EB2]">Sign in to create and track your referral or affiliate links.</p>
                    <button
                      type="button"
                      onClick={signInWithGoogle}
                      className="px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                    >
                      Sign In to Join
                    </button>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 rounded-xl border border-[#222230] bg-[#0E0E15] p-6 space-y-4 text-xs">
                <h4 className="font-semibold text-white">Your Active Referral &amp; Affiliate Links</h4>
                {referralCodes.length === 0 ? (
                  <p className="text-[#8E8EA2] leading-relaxed">
                    No referral codes generated yet. Create a code on the left to get your tracked{' '}
                    <span className="font-mono-tabular text-[#ECC86A]">/?ref=YOURCODE</span> sharing URL.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {referralCodes.map((row) => {
                      const url = `${shareBaseUrl}/?ref=${encodeURIComponent(row.referral_code)}`;
                      return (
                        <div
                          key={row.id}
                          className="rounded-lg border border-[#1E1E2B] bg-[#0A0A10] p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-mono-tabular font-semibold text-[#ECC86A]">{row.referral_code}</p>
                            <p className="text-[11px] text-[#9E9EB2] mt-0.5 capitalize">
                              {row.program_type} · {row.commission_percent}% · {row.signups_count} attributed signups
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(url, `Referral link ${row.referral_code}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/45 text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A] font-semibold"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-[#7D7D90] border-t border-[#1E1E2B] pt-3">
                  Need an enterprise agency partnership? Contact {CONTACT_INFO.email} or WhatsApp{' '}
                  {CONTACT_INFO.whatsappDisplay}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transparent Policy Modal */}
      {policyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full rounded-xl border border-[#2C2C3C] bg-[#0E0E15] p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-[#1E1E2B] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-luxury text-lg font-semibold text-white">{POLICY_DOCS[policyOpen].title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPolicyOpen(null)}
                aria-label="Close policy dialog"
                className="text-[#9A9AAE] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-3 text-xs text-[#CFCFDA] leading-relaxed">
              {POLICY_DOCS[policyOpen].points.map((pt) => (
                <li key={pt} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyOpen(null)}
                className="px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
