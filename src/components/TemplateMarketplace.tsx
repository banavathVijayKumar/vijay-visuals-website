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
import { BUSINESS_CATEGORIES } from '../data/content';
import { DEMO_CATEGORY_PROFILES, categoryForTemplate } from '../data/demoBuilder';
import { getDemoStorefront } from '../data/demo';
import { DEMO_STORE_TEMPLATE_MAP } from '../lib/templateTransfer';
import { TEMPLATES_DATA, type BusinessTemplate } from '../lib/templatesData';
import {
  TEMPLATE_PURCHASE_DETAILS,
  TEMPLATE_PURCHASE_EXCLUSIONS,
  TEMPLATE_PURCHASE_INCLUSIONS,
  TEMPLATE_UPDATE_TERMS,
  describeTemplatePrice,
  findTemplatePlan,
} from '../lib/templatePricing';
import type { PlatformPlanRecord } from '../types/platform';

interface TemplateMarketplaceProps {
  plans: PlatformPlanRecord[];
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

export const TemplateMarketplace: React.FC<TemplateMarketplaceProps> = ({
  plans,
  onUseTemplate,
  onOpenStorefront,
  onNotify,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortMode>('featured');
  const [demoOnly, setDemoOnly] = useState(false);
  const [detailTemplateId, setDetailTemplateId] = useState<string | null>(null);

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
    const priceOf = (template: BusinessTemplate): number => {
      const view = describeTemplatePrice(plans, template.id);
      return view.active ? view.priceInr ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    };
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
  const detailPlan = detailTemplate ? findTemplatePlan(plans, detailTemplate.id) : null;

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
                Template Marketplace · {TEMPLATES_DATA.length} verified industry templates
              </p>
              <h1 className="font-luxury text-3xl md:text-4xl font-bold text-white">
                Start from a real design. Make it your own.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#A9A9BC]">
                Open a safe demo where available, use the template in the builder, customise the same design,
                preview it on every screen, and see one clear one-time price before checkout.
              </p>
            </div>
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#101017] px-5 py-4 text-xs text-[#B8B8C8]">
              <div className="flex items-center gap-2 text-[#ECC86A] font-semibold">
                <Sparkles className="w-4 h-4" />
                Preview-safe marketplace
              </div>
              <p className="mt-2 max-w-xs leading-relaxed">
                No checkout, account creation or database write is performed from this page in Preview.
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
                        <span className={`text-sm font-bold ${price.active ? 'text-[#ECC86A]' : 'text-[#A3A3B5]'}`}>
                          {price.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!demoSlug}
                          onClick={() => {
                            if (!demoSlug) {
                              onNotify('This template demo is coming soon. Use This Template still works from the catalogue.');
                              return;
                            }
                            onOpenStorefront(demoSlug);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#2B2B3C] bg-[#101018] px-2 py-2 text-[11px] font-semibold text-[#C5C5D6] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {demoSlug ? 'View Demo' : 'Coming Soon'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(template)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gold-gradient px-2 py-2 text-[11px] font-bold text-[#08080A]"
                        >
                          Use This Template
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
                <p className="text-lg font-bold text-[#ECC86A]">{detailPrice.label}</p>
                <p className="mt-1 text-[10px] text-[#8E8EA2]">SKU: {detailPrice.code}</p>
              </DetailCard>
              <DetailCard title="Status">
                <p className="text-sm font-semibold text-white">
                  {detailPrice.active ? 'Available for purchase' : 'Owner setup pending'}
                </p>
                <p className="mt-1 text-[10px] text-[#8E8EA2]">
                  {detailPlan ? `GST ${detailPlan.category === 'template' ? 'at checkout' : 'per package'}` : 'No stored plan yet'}
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
                  else onNotify('Demo for this template is coming soon.');
                }}
                disabled={!DEMO_BY_TEMPLATE.has(detailTemplate.id)}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2B2B3C] px-4 py-2.5 text-xs text-[#C5C5D6] disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                {DEMO_BY_TEMPLATE.has(detailTemplate.id) ? 'Open Safe Demo' : 'Demo Coming Soon'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUseTemplate(detailTemplate);
                  setDetailTemplateId(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-bold text-[#08080A]"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Use This Template
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
