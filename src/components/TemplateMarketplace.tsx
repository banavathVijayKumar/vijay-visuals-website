import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CreditCard,
  Eye,
  Filter,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { BUSINESS_CATEGORIES, CONTACT_INFO, getI18n, type Lang } from '../data/content';
import { DEMO_CATEGORY_PROFILES, categoryForTemplate } from '../data/demoBuilder';
import { getDemoStorefront } from '../data/demo';
import { PackagePurchaseGuide } from './PackagePurchaseGuide';
import { getProposedTemplatePrice, formatInr } from '../lib/customerPricing';
import { DEMO_STORE_TEMPLATE_MAP } from '../lib/templateTransfer';
import { TEMPLATE_CLAIM_DISCLOSURE, TEMPLATES_DATA, type BusinessTemplate } from '../lib/templatesData';
import {
  TEMPLATE_PURCHASE_DETAILS,
  TEMPLATE_PURCHASE_EXCLUSIONS,
  TEMPLATE_PURCHASE_INCLUSIONS,
  TEMPLATE_TAX_NOTE,
  TEMPLATE_UPDATE_TERMS,
  describeTemplatePrice,
  type TemplatePriceView,
} from '../lib/templatePricing';
import type { PlatformPlanRecord } from '../types/platform';

interface TemplateMarketplaceProps {
  plans: PlatformPlanRecord[];
  lang?: Lang;
  onUseTemplate: (templateId: string) => void;
  onOpenStorefront: (slug: string) => void;
  onNotify: (message: string) => void;
}

type SortMode = 'featured' | 'name' | 'price_low' | 'price_high';

// Only the three verified frontend-only demo fixtures may expose View Demo.
// Catalogue demo_slug values are legacy names and are not silently substituted.
const DEMO_BY_TEMPLATE = new Map<string, string>();
for (const [slug, templateId] of Object.entries(DEMO_STORE_TEMPLATE_MAP)) {
  if (getDemoStorefront(slug)) DEMO_BY_TEMPLATE.set(templateId, slug);
}

const templateThumbnail = (template: BusinessTemplate): string => {
  const safeDemoSlug = DEMO_BY_TEMPLATE.get(template.id);
  const demo = safeDemoSlug ? getDemoStorefront(safeDemoSlug) : null;
  if (demo?.tenant.bannerImage) return demo.tenant.bannerImage;
  const categoryId = categoryForTemplate(template.id);
  return DEMO_CATEGORY_PROFILES[categoryId]?.banner || '';
};

interface CustomerPriceDisplay {
  label: string;
  note: string;
  conflict: boolean;
  purchasable: boolean;
}

/**
 * Shows the exact proposed price even while the SKU is inactive in Preview D1.
 * If an Owner-configured active price disagrees with the approved schedule, we
 * surface the conflict instead of silently inventing a price.
 */
function customerPriceDisplay(templateId: string, server: TemplatePriceView): CustomerPriceDisplay {
  const proposed = getProposedTemplatePrice(templateId);
  if (!proposed) {
    return { label: 'Schedule missing', note: 'No approved price row found.', conflict: true, purchasable: false };
  }
  if (server.active && server.priceInr === proposed.priceInr) {
    return {
      label: `${formatInr(proposed.priceInr)} one-time base price`,
      note: `Owner-activated price matches the approved schedule. ${TEMPLATE_TAX_NOTE}`,
      conflict: false,
      purchasable: true,
    };
  }
  if (server.active) {
    return {
      label: `Proposed ${formatInr(proposed.priceInr)} · configured price differs`,
      note: `Server price is ${formatInr(Number(server.priceInr || 0))}; Owner review required.`,
      conflict: true,
      purchasable: false,
    };
  }
  return {
    label: `Proposed ${formatInr(proposed.priceInr)} · not active yet`,
    note: 'Preview display only. Purchasing starts after Owner configuration and activation.',
    conflict: false,
    purchasable: false,
  };
}

export const TemplateMarketplace: React.FC<TemplateMarketplaceProps> = ({
  plans,
  lang = 'en',
  onUseTemplate,
  onOpenStorefront,
  onNotify,
}) => {
  const t = getI18n(lang);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortMode>('featured');
  const [demoOnly, setDemoOnly] = useState(false);
  const [detailTemplateId, setDetailTemplateId] = useState<string | null>(null);
  const [purchaseTemplateId, setPurchaseTemplateId] = useState<string | null>(null);
  const [preferredTemplateId, setPreferredTemplateId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = TEMPLATES_DATA.filter((template) => {
      const broadCategory = categoryForTemplate(template.id);
      if (category !== 'all' && broadCategory !== category) return false;
      if (demoOnly && !DEMO_BY_TEMPLATE.has(template.id)) return false;
      if (!needle) return true;
      return (
        template.name.toLowerCase().includes(needle) ||
        template.category.toLowerCase().includes(needle) ||
        template.description.toLowerCase().includes(needle) ||
        template.features.some((feature) => feature.toLowerCase().includes(needle))
      );
    });
    const priceOf = (template: BusinessTemplate): number =>
      getProposedTemplatePrice(template.id)?.priceInr ?? Number.MAX_SAFE_INTEGER;
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'price_low') return priceOf(a) - priceOf(b);
      if (sort === 'price_high') return priceOf(b) - priceOf(a);
      return TEMPLATES_DATA.indexOf(a) - TEMPLATES_DATA.indexOf(b);
    });
  }, [query, category, sort, demoOnly, plans]);

  const detailTemplate = detailTemplateId
    ? TEMPLATES_DATA.find((template) => template.id === detailTemplateId) || null
    : null;
  const detailPrice = detailTemplate ? describeTemplatePrice(plans, detailTemplate.id) : null;
  const detailDisplay = detailTemplate && detailPrice
    ? customerPriceDisplay(detailTemplate.id, detailPrice)
    : null;
  const purchaseTemplate = purchaseTemplateId
    ? TEMPLATES_DATA.find((template) => template.id === purchaseTemplateId) || null
    : null;
  const purchaseServerPrice = purchaseTemplate
    ? describeTemplatePrice(plans, purchaseTemplate.id)
    : null;
  const purchaseDisplay = purchaseTemplate && purchaseServerPrice
    ? customerPriceDisplay(purchaseTemplate.id, purchaseServerPrice)
    : null;

  const openPurchase = (templateId: string) => {
    setPurchaseTemplateId(templateId);
    setPreferredTemplateId(templateId);
  };

  const handleUseTemplate = (template: BusinessTemplate) => {
    if (detailPrice && !detailPrice.active && detailPrice.configured) {
      onNotify('Owner pricing is configured but this template is not active yet.');
      return;
    }
    onUseTemplate(template.id);
  };

  return (
    <main className="min-h-screen bg-[#08080C] text-white">
      <section className="border-b border-[#1D1D26] bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_45%)]">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 md:py-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-medium tracking-wider text-[#D4AF37] mb-2">
                A · Website Templates · Template Marketplace · {TEMPLATES_DATA.length} verified industry templates
              </p>
              <h1 className="font-luxury text-3xl md:text-4xl font-bold text-white">
                {t.customerTemplateChoiceTitle}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#A9A9BC]">
                {t.customerTemplateChoiceSubtitle} A Website Template is a ready-made design you can
                edit with your own brand. It is not a complete package, hosting plan or payment
                gateway by itself.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8E8EA2]">
                Prices shown are the exact proposed one-time prices from the approved schedule.
                Where a SKU is not yet Owner-activated, the price is clearly marked as proposed and
                cannot be purchased.
              </p>
            </div>
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#101017] px-5 py-4 text-xs text-[#B8B8C8]">
              <div className="flex items-center gap-2 text-[#ECC86A] font-semibold">
                <Sparkles className="w-4 h-4" />
                Preview-safe purchase guidance
              </div>
              <p className="mt-2 max-w-xs leading-relaxed">
                No template price is written, activated or charged from this page. Cashfree is the
                only intended platform gateway; success is shown only after server verification.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <label className="relative block">
              <span className="sr-only">Search templates</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-[#8E8EA2]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by industry, feature or template name"
                className="w-full rounded-lg border border-[#2A2A38] bg-[#0D0D14] py-3 pl-10 pr-3 text-sm text-white placeholder-[#77778B] focus:border-[#D4AF37] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="sr-only">Sort templates</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="w-full rounded-lg border border-[#2A2A38] bg-[#0D0D14] px-3 py-3 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="featured">Featured order</option>
                <option value="name">Name A–Z</option>
                <option value="price_low">Price: low to high</option>
                <option value="price_high">Price: high to low</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setDemoOnly((value) => !value)}
              aria-pressed={demoOnly}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-semibold transition-colors ${
                demoOnly
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#08080A]'
                  : 'border-[#2A2A38] bg-[#0D0D14] text-[#B8B8C8] hover:text-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Demo available only
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Template categories">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-full border px-3 py-1.5 text-[11px] ${
                category === 'all'
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#08080A] font-semibold'
                  : 'border-[#2A2A38] bg-[#101018] text-[#B8B8C8] hover:text-white'
              }`}
            >
              All ({TEMPLATES_DATA.length})
            </button>
            {BUSINESS_CATEGORIES.map((item) => {
              const count = TEMPLATES_DATA.filter((template) => categoryForTemplate(template.id) === item.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] ${
                    category === item.id
                      ? 'border-[#D4AF37] bg-[#D4AF37] text-[#08080A] font-semibold'
                      : 'border-[#2A2A38] bg-[#101018] text-[#B8B8C8] hover:text-white'
                  }`}
                >
                  {item.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-10 sm:px-6">
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-950/10 px-4 py-3 text-[11px] leading-relaxed text-[#D8C99A]">
          <strong className="text-[#ECC86A]">Design scope:</strong> {TEMPLATE_CLAIM_DISCLOSURE}{' '}
          <strong className="text-[#ECC86A]">Taxes:</strong> {TEMPLATE_TAX_NOTE}
        </div>
        <div className="mb-5 flex items-center justify-between text-xs text-[#8E8EA2]">
          <span>Showing {filteredTemplates.length} of {TEMPLATES_DATA.length} templates</span>
          <span>Demo availability is shown per template</span>
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="rounded-xl border border-[#282838] bg-[#0D0D14] p-8 text-center text-sm text-[#B8B8C8]">
            No templates match those filters. Clear the search or choose another category.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const demoSlug = DEMO_BY_TEMPLATE.get(template.id);
              const price = describeTemplatePrice(plans, template.id);
              const display = customerPriceDisplay(template.id, price);
              return (
                <article
                  key={template.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-[#242433] bg-[#0D0D14] shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                >
                  <div className="relative h-40 overflow-hidden bg-[#151522]">
                    <img
                      src={templateThumbnail(template)}
                      alt={`${template.name} template preview`}
                      width={640}
                      height={360}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08080C] via-transparent to-transparent" />
                    <span
                      className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#08080A]"
                      style={{ backgroundColor: template.accent_color || '#D4AF37' }}
                    >
                      {template.badge || template.category}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white">{template.name}</h2>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-[#D4AF37]">{template.category}</p>
                    </div>
                    <p className="line-clamp-3 text-xs leading-relaxed text-[#A3A3B5]">{template.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {template.features.slice(0, 3).map((feature) => (
                        <span
                          key={feature}
                          className="rounded border border-[#292938] bg-[#101018] px-2 py-1 text-[10px] text-[#C5C5D6]"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto space-y-3 border-t border-[#20202E] pt-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-[#8E8EA2]">One-time template price</span>
                        <span className={`text-right text-sm font-bold ${display.purchasable ? 'text-[#ECC86A]' : 'text-[#C7C7D8]'}`}>
                          {display.label}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-[#858599]">SKU {getProposedTemplatePrice(template.id)?.sku}</p>
                      <p className={`text-[10px] leading-relaxed ${display.conflict ? 'text-amber-300' : 'text-[#8E8EA2]'}`}>
                        {display.note}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!demoSlug}
                          onClick={() => {
                            if (!demoSlug) {
                              onNotify('No live demo is available for this template yet. You can still customize the design.');
                              return;
                            }
                            onOpenStorefront(demoSlug);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2B2B3C] bg-[#101018] px-2 py-2 text-[11px] font-semibold text-[#C5C5D6] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {demoSlug ? 'View Demo' : 'No live demo yet'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openPurchase(template.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gold-gradient px-2 py-2 text-[11px] font-bold text-[#08080A]"
                        >
                          Buy / Customize
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailTemplateId(template.id)}
                        className="w-full text-center text-[11px] text-[#B8B8C8] hover:text-[#ECC86A] hover:underline"
                      >
                        See price, features & terms
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PackagePurchaseGuide
        plans={plans}
        lang={lang}
        preferredTemplateId={preferredTemplateId}
        onUseTemplate={(templateId) => handleUseTemplate(TEMPLATES_DATA.find((item) => item.id === templateId) || TEMPLATES_DATA[0])}
        onNotify={onNotify}
      />

      {detailTemplate && detailPrice && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${detailTemplate.name} template details`}
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-2xl border border-[#2A2A38] bg-[#0D0D14] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#D4AF37]">{detailTemplate.category}</p>
                <h2 className="mt-1 font-luxury text-2xl font-bold text-white">{detailTemplate.name}</h2>
                <p className="mt-2 text-xs text-[#A3A3B5]">{detailTemplate.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTemplateId(null)}
                aria-label="Close template details"
                className="rounded-md border border-[#2A2A38] p-2 text-[#B8B8C8] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <DetailCard title="One-time price">
                <p className="text-lg font-bold text-[#ECC86A]">{detailDisplay?.label}</p>
                <p className="mt-1 text-[10px] text-[#8E8EA2]">
                  SKU: {getProposedTemplatePrice(detailTemplate.id)?.sku || detailPrice.code}
                </p>
                {detailDisplay?.conflict && (
                  <p className="mt-1 text-[10px] text-amber-300">{detailDisplay.note}</p>
                )}
              </DetailCard>
              <DetailCard title="Status">
                <p className="text-sm font-semibold text-white">
                  {detailDisplay?.purchasable ? 'Available for purchase' : 'Owner setup pending'}
                </p>
                <p className="mt-1 text-[10px] text-[#8E8EA2]">
                  {detailDisplay?.note || 'No stored plan yet'}
                </p>
              </DetailCard>
              <DetailCard title="Template features">
                <p className="text-xs text-[#C5C5D6]">{detailTemplate.features.length} listed capabilities</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {detailTemplate.features.slice(0, 4).map((feature) => (
                    <span key={feature} className="rounded bg-[#171725] px-1.5 py-1 text-[9px] text-[#B8B8C8]">
                      {feature}
                    </span>
                  ))}
                </div>
              </DetailCard>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <DetailList title="Included" items={TEMPLATE_PURCHASE_INCLUSIONS} icon={<Check className="w-3.5 h-3.5 text-emerald-300" />} />
              <DetailList title="Not included / separately charged" items={TEMPLATE_PURCHASE_EXCLUSIONS} icon={<AlertCircle className="w-3.5 h-3.5 text-amber-300" />} />
              <DetailList title="Updates & support" items={TEMPLATE_UPDATE_TERMS} icon={<Sparkles className="w-3.5 h-3.5 text-[#ECC86A]" />} />
              <DetailCard title="Delivery details">
                <ul className="space-y-2">
                  {TEMPLATE_PURCHASE_DETAILS.map((row) => (
                    <li key={row.label} className="text-[11px] leading-relaxed text-[#A3A3B5]">
                      <strong className="text-white">{row.label}:</strong> {row.value}
                    </li>
                  ))}
                </ul>
              </DetailCard>
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-[#20202E] pt-4 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  const demoSlug = DEMO_BY_TEMPLATE.get(detailTemplate.id);
                  if (demoSlug) onOpenStorefront(demoSlug);
                  else onNotify('No live demo is available for this template yet.');
                }}
                disabled={!DEMO_BY_TEMPLATE.has(detailTemplate.id)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2B2B3C] px-4 py-2.5 text-xs text-[#C5C5D6] disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                {DEMO_BY_TEMPLATE.has(detailTemplate.id) ? 'Open Safe Demo' : 'No live demo yet'}
              </button>
              <button
                type="button"
                onClick={() => {
                  openPurchase(detailTemplate.id);
                  setDetailTemplateId(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-bold text-[#08080A]"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Buy Template / Customize This Design
              </button>
            </div>
          </div>
        </div>
      )}

      {purchaseTemplate && purchaseServerPrice && purchaseDisplay && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${purchaseTemplate.name} purchase summary`}
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-2xl border border-[#2A2A38] bg-[#0D0D14] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#D4AF37]">Template-only purchase summary</p>
                <h2 className="mt-1 font-luxury text-2xl font-bold text-white">{purchaseTemplate.name}</h2>
                <p className="mt-1 text-[11px] text-[#8E8EA2]">SKU {getProposedTemplatePrice(purchaseTemplate.id)?.sku}</p>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseTemplateId(null)}
                aria-label="Close purchase summary"
                className="rounded-md border border-[#2A2A38] p-2 text-[#B8B8C8] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-[#D4AF37]/40 bg-[#15120A] p-4">
              <p className="text-xs text-[#A3A3B5]">Proposed one-time template price</p>
              <p className="mt-1 text-2xl font-bold text-[#ECC86A]">{purchaseDisplay.label}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#C5C5D6]">{purchaseDisplay.note}</p>
            </div>

            <div className="mt-5 rounded-lg border border-[#242433] bg-[#101018] p-4">
              <h3 className="text-xs font-semibold text-white">Checkout summary (template-only path)</h3>
              <dl className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Selected item</dt>
                  <dd className="text-right text-white">One website template — not a complete package</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Selected template</dt>
                  <dd className="max-w-[65%] truncate text-right text-white">{purchaseTemplate.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Base price</dt>
                  <dd className="font-mono-tabular text-white">{purchaseDisplay.label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Optional extras selected</dt>
                  <dd className="font-mono-tabular text-white">{formatInr(0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Applicable configured tax</dt>
                  <dd className="text-right text-white">
                    {purchaseDisplay.purchasable ? 'Shown by the server Cashfree order' : 'Not available until activation'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Final payable amount</dt>
                  <dd className="text-right font-semibold text-[#ECC86A]">
                    {purchaseDisplay.purchasable ? 'Shown before Cashfree payment' : 'No payment available yet'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Separate recurring costs</dt>
                  <dd className="text-right text-white">None stated for template-only</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Refund/cancellation policy</dt>
                  <dd className="text-right text-white">Not published — no refund promised</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8E8EA2]">Support contact</dt>
                  <dd className="text-right text-white">{CONTACT_INFO.email} · {CONTACT_INFO.whatsappDisplay}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[10px] leading-relaxed text-[#858599]">
                Cashfree is the only intended platform gateway. Success is shown only after genuine
                server-side verification. Razorpay is not used.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <DetailList
                title="Included with template-only purchase"
                items={TEMPLATE_PURCHASE_INCLUSIONS}
                icon={<Check className="h-3.5 w-3.5 text-emerald-300" />}
              />
              <DetailList
                title="Not included unless separately purchased"
                items={TEMPLATE_PURCHASE_EXCLUSIONS}
                icon={<AlertCircle className="h-3.5 w-3.5 text-amber-300" />}
              />
            </div>
            <div className="mt-4">
              <DetailList
                title="Updates, support and delivery terms"
                items={[...TEMPLATE_UPDATE_TERMS, ...TEMPLATE_PURCHASE_DETAILS.map((row) => `${row.label}: ${row.value}`)]}
                icon={<Sparkles className="h-3.5 w-3.5 text-[#ECC86A]" />}
              />
            </div>

            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-950/15 p-4 text-[11px] leading-relaxed text-[#D8C7A5]">
              This is not a hosted, published, fully developed website by itself. Domain, hosting,
              gateway, custom development and ongoing maintenance are separate unless explicitly
              included in an approved package or proposal. Cashfree is the only intended platform
              gateway and success is shown only after server verification.
            </div>

            <div className="mt-6 flex flex-col gap-2 border-t border-[#20202E] pt-4 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setPurchaseTemplateId(null);
                  handleUseTemplate(purchaseTemplate);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-bold text-[#08080A]"
              >
                Customize This Design
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferredTemplateId(purchaseTemplate.id);
                  setPurchaseTemplateId(null);
                  document.getElementById('complete-packages')?.scrollIntoView({ behavior: 'smooth' });
                  onNotify('Template selected. Review the ₹7,999 package or submit a quote-required requirement.');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2B2B3C] px-4 py-2.5 text-xs text-[#C5C5D6]"
              >
                Request Package / Owner Review
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center rounded-md border border-[#2B2B3C] px-4 py-2.5 text-xs text-[#8E8EA2] disabled:opacity-60"
                title="Template purchasing is disabled until the Owner activates the SKU."
              >
                Buy Template — activation pending
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const DetailCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-[#242433] bg-[#101018] p-4">
    <h3 className="mb-2 text-xs font-semibold text-white">{title}</h3>
    {children}
  </div>
);

const DetailList: React.FC<{ title: string; items: readonly string[]; icon: React.ReactNode }> = ({
  title,
  items,
  icon,
}) => (
  <DetailCard title={title}>
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-[#A3A3B5]">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </DetailCard>
);

export default TemplateMarketplace;
