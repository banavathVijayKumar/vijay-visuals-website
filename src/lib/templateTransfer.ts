// ============================================================================
// Preview-only template handoff.
// Builds an independent local copy of an existing safe demo storefront or a
// catalogue template. No database rows, accounts, orders or payments are
// created here. Unknown legacy/demo IDs fail explicitly instead of silently
// substituting a different design.
// ============================================================================

import {
  DEMO_CATEGORY_PROFILES,
  buildTenantDraftPayload,
  createDraftFromTemplate,
  type DemoBusinessDraft,
  type DemoCategoryId,
} from '../data/demoBuilder';
import { getDemoStorefront } from '../data/demo';
import { TEMPLATES_DATA, type BusinessTemplate } from './templatesData';
import { planCodeForTemplate } from '@/functions/api/_planTiers';
import type {
  CouponRecord,
  ProductRecord,
  ReviewRecord,
  ServiceRecord,
  TenantModules,
  TenantRecord,
} from '../types/platform';

export type TemplateHandoffRequest =
  | { source: 'marketplace'; templateId: string }
  | { source: 'demo-storefront'; slug: string }
  | { source: 'theme-gallery'; themeId: string };

export interface TemplateBuilderSeed {
  templateId: string;
  templateName: string;
  planCode: string;
  source: TemplateHandoffRequest['source'];
  sourceLabel: string;
  tenant: TenantRecord;
  products: ProductRecord[];
  services: ServiceRecord[];
  coupons: CouponRecord[];
  reviews: ReviewRecord[];
  draft: DemoBusinessDraft;
  transferNotes: string[];
}

export type TemplateResolution =
  | { ok: true; seed: TemplateBuilderSeed }
  | { ok: false; error: string };

/**
 * Legacy demo storefronts used visual-theme IDs. The mapping is explicit so a
 * new or unknown theme can never be silently replaced with an arbitrary
 * industry template.
 */
export const LEGACY_THEME_TEMPLATE_MAP: Readonly<Record<string, string>> = {
  'obsidian-luxury': 'fashion-boutique',
  'slate-precision': 'electronics-store',
  'culinary-warm': 'restaurant',
  'botanical-modern': 'organic-farming',
};

/** Explicit mapping for the three frontend-only safe demo storefronts. */
export const DEMO_STORE_TEMPLATE_MAP: Readonly<Record<string, string>> = {
  'deccan-royal-couture': 'fashion-boutique',
  'nocturne-audio-tech': 'electronics-store',
  'nizam-heritage-kitchen': 'restaurant',
};

const STOREFRONT_SECTION_IDS = new Set(['hero', 'catalog', 'gallery', 'booking', 'reviews', 'contact']);

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function findTemplate(templateId: string): BusinessTemplate | null {
  const normalized = String(templateId || '').trim().toLowerCase();
  return TEMPLATES_DATA.find((entry) => entry.id === normalized) || null;
}

export function resolveCatalogTemplate(templateId: string): BusinessTemplate | null {
  return findTemplate(templateId);
}

export function resolveLegacyThemeId(themeId: string): BusinessTemplate | null {
  const mapped = LEGACY_THEME_TEMPLATE_MAP[String(themeId || '').trim().toLowerCase()];
  return mapped ? findTemplate(mapped) : null;
}

function normalizePrice(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const digits = String(value || '').replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function formatDraftPrice(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

function modulesForCategory(categoryId: DemoCategoryId): TenantModules {
  const mode = DEMO_CATEGORY_PROFILES[categoryId]?.mode;
  const commerce = mode === 'commerce' || mode === 'food';
  return {
    ecommerce: commerce,
    cartCheckout: false,
    gallery: true,
    bookings: !commerce,
    whatsappOrder: true,
    reviews: true,
    wishlist: false,
    coupons: false,
    wholesale: false,
  };
}

function itemsToProducts(draft: DemoBusinessDraft, tenantId: number): ProductRecord[] {
  return draft.items.map((item, index) => {
    const price = normalizePrice(item.price);
    return {
      id: -(index + 1),
      tenantId,
      category: item.category || draft.categoryId,
      subcategory: 'Sample',
      name: item.name,
      description: item.description,
      price,
      compareAtPrice: 0,
      wholesalePrice: 0,
      minWholesaleQty: 1,
      stock: 25,
      lowStockThreshold: 3,
      imageUrl: item.image,
      images: item.image ? [item.image] : [],
      videoUrl: '',
      variantsJson: JSON.stringify(
        [...item.sizes.map((size) => ({ name: 'Size', value: size })), ...item.colors.map((color) => ({ name: 'Color', value: color }))]
      ),
      specs: item.options.join(' · '),
      sku: `TEMPLATE-${index + 1}`,
      barcode: '',
      featured: index === 0,
      bestseller: false,
      rating: '5.0',
      reviewCount: 0,
      active: true,
    };
  });
}

function itemsToServices(draft: DemoBusinessDraft, tenantId: number): ServiceRecord[] {
  return draft.items.map((item, index) => ({
    id: -(index + 1),
    tenantId,
    name: item.name,
    description: item.description,
    category: item.category || draft.categoryId,
    price: normalizePrice(item.price),
    compareAtPrice: 0,
    durationMinutes: 0,
    sortOrder: index,
    imageUrl: item.image,
    active: true,
  }));
}

function draftSectionsToTenant(draft: DemoBusinessDraft, tenant: TenantRecord): TenantRecord {
  const sectionOrder = draft.sections
    .filter((section) => section.visible && STOREFRONT_SECTION_IDS.has(section.id))
    .map((section) => section.id);
  const unsupportedPages = draft.sections
    .filter((section) => section.visible && !STOREFRONT_SECTION_IDS.has(section.id))
    .map((section) => ({
      slug: section.id,
      title: section.title,
      content: section.id === 'about' ? draft.content.aboutText : `${section.title} details can be added here.`,
      inNav: true,
      blocks: [],
    }));
  return {
    ...tenant,
    sectionOrder: Array.from(new Set(sectionOrder.length > 0 ? sectionOrder : ['hero', 'catalog', 'gallery', 'contact'])),
    customPages: unsupportedPages.length > 0 ? unsupportedPages : tenant.customPages || [],
  };
}

function seedFromDraft(
  template: BusinessTemplate,
  draft: DemoBusinessDraft,
  source: TemplateHandoffRequest['source'],
  sourceLabel: string
): TemplateBuilderSeed {
  const suffix = uniqueSuffix();
  const payload = buildTenantDraftPayload(draft);
  const tenantId = -(Date.now() % 1000000);
  const baseTenant: TenantRecord = {
    id: tenantId,
    websiteId: `local-template-${suffix}`,
    ownerUserId: null,
    name: draft.identity.businessName || template.name,
    slug: `${draft.slug}-custom-${suffix.slice(-5)}`,
    category: draft.categoryId,
    templateId: template.id,
    templateName: template.name,
    templateFeatures: template.features,
    tagline: draft.identity.tagline,
    heroHeadline: draft.content.heroHeadline,
    heroSubheadline: draft.content.heroSubheadline,
    ctaText: 'Explore Collection',
    description: draft.content.aboutText,
    logoText: (draft.identity.businessName || template.name).slice(0, 6).toUpperCase(),
    logoImage: draft.identity.logoImage,
    bannerImage: draft.content.bannerImage,
    galleryImages: draft.content.galleryImages,
    primaryColor: draft.design.primaryColor,
    accentColor: draft.design.accentColor,
    fontFamily: draft.design.fontFamily,
    customDomain: '',
    seoTitle: `${draft.identity.businessName || template.name} — Preview`,
    seoDescription: template.description,
    currency: 'INR',
    language: 'en',
    phone: draft.identity.phone,
    whatsapp: draft.identity.whatsapp.replace(/\D/g, ''),
    address: draft.identity.address,
    businessHours: draft.identity.businessHours,
    deliveryInfo: '',
    returnPolicy: '',
    enabledModules: modulesForCategory(draft.categoryId),
    published: false,
    status: 'unpublished',
    planTier: 'website_only',
    pwaEnabled: false,
    pwaAppName: '',
    pwaShortName: '',
    pwaThemeColor: draft.design.accentColor,
    pwaLicenseKey: '',
    aiCreditsLimit: 0,
    aiCreditsUsed: 0,
    deliveryFee: 0,
    deliveryCommissionPct: 0,
    codEnabled: false,
    upiId: '',
    cashfreeOnlineReady: false,
    demoBuilderDraft: payload.demoBuilderDraft as DemoBusinessDraft,
  };

  const tenant = draftSectionsToTenant(draft, baseTenant);
  return {
    templateId: template.id,
    templateName: template.name,
    planCode: planCodeForTemplate(template.id),
    source,
    sourceLabel,
    tenant,
    products: itemsToProducts(draft, tenantId),
    services: itemsToServices(draft, tenantId),
    coupons: [],
    reviews: [],
    draft,
    transferNotes: [
      'Independent local template copy; no customer website was created.',
      'Online checkout is disabled in this preview; enable payment settings only after merchant approval.',
      ...unsupportedSectionNotes(draft),
    ],
  };
}

function unsupportedSectionNotes(draft: DemoBusinessDraft): string[] {
  return draft.sections
    .filter((section) => section.visible && !STOREFRONT_SECTION_IDS.has(section.id))
    .map((section) => `${section.title} was transferred as a custom page because the shared storefront renderer does not support it as a standalone section.`);
}

function createCatalogSeed(template: BusinessTemplate): TemplateBuilderSeed {
  const draft = createDraftFromTemplate(template);
  return seedFromDraft(template, draft, 'marketplace', `Template catalogue · ${template.category}`);
}

function createDemoSeed(slug: string): TemplateResolution {
  const demo = getDemoStorefront(slug);
  if (!demo) {
    return { ok: false, error: `Demo storefront "${slug}" is unavailable. No substitute template was loaded.` };
  }
  const mappedId = DEMO_STORE_TEMPLATE_MAP[slug];
  if (!mappedId) {
    return { ok: false, error: `No safe template mapping exists for demo "${slug}". No substitute template was loaded.` };
  }
  const template = findTemplate(mappedId);
  if (!template) {
    return { ok: false, error: `Mapped catalogue template "${mappedId}" for demo "${slug}" was not found. No substitute template was loaded.` };
  }

  const suffix = uniqueSuffix();
  const draft = createDraftFromTemplate(template);
  const demoTenant = demo.tenant;
  const localId = -(Date.now() % 1000000);
  draft.id = `demo_transfer_${suffix}`;
  draft.slug = `${demoTenant.slug}-custom-${suffix.slice(-5)}`;
  draft.templateId = template.id;
  draft.templateName = template.name;
  draft.identity = {
    businessName: demoTenant.name,
    tagline: demoTenant.tagline || draft.identity.tagline,
    email: '',
    phone: demoTenant.phone || '',
    whatsapp: demoTenant.whatsapp || '',
    address: demoTenant.address || '',
    mapUrl: '',
    businessHours: demoTenant.businessHours || '',
    logoImage: demoTenant.logoImage || '',
  };
  draft.design = {
    ...draft.design,
    primaryColor: demoTenant.primaryColor || draft.design.primaryColor,
    accentColor: demoTenant.accentColor || draft.design.accentColor,
    fontFamily: demoTenant.fontFamily || draft.design.fontFamily,
  };
  draft.content = {
    heroHeadline: demoTenant.heroHeadline || draft.content.heroHeadline,
    heroSubheadline: demoTenant.heroSubheadline || draft.content.heroSubheadline,
    aboutText: demoTenant.description || draft.content.aboutText,
    bannerImage: demoTenant.bannerImage || draft.content.bannerImage,
    galleryImages: demoTenant.galleryImages?.length ? [...demoTenant.galleryImages] : [demoTenant.bannerImage],
  };
  draft.items = demo.products.map((product, index) => ({
    id: `demo-item-${index + 1}`,
    name: product.name,
    description: product.description,
    price: formatDraftPrice(product.price),
    category: product.category,
    image: product.imageUrl,
    sizes: [],
    colors: [],
    options: product.specs ? [product.specs] : [],
  }));

  const payload = buildTenantDraftPayload(draft);
  const tenant: TenantRecord = {
    ...demoTenant,
    id: localId,
    websiteId: `local-demo-copy-${suffix}`,
    ownerUserId: null,
    slug: draft.slug,
    templateId: template.id,
    templateName: template.name,
    templateFeatures: template.features,
    tagline: demoTenant.tagline,
    heroHeadline: demoTenant.heroHeadline,
    heroSubheadline: demoTenant.heroSubheadline,
    ctaText: demoTenant.ctaText || 'Explore Collection',
    description: demoTenant.description,
    seoTitle: demoTenant.seoTitle,
    seoDescription: demoTenant.seoDescription,
    currency: demoTenant.currency || 'INR',
    published: false,
    status: 'unpublished',
    enabledModules: {
      ...(demoTenant.enabledModules || modulesForCategory(draft.categoryId)),
      cartCheckout: false,
      coupons: false,
      wholesale: false,
    },
    planTier: 'website_only',
    pwaEnabled: false,
    pwaLicenseKey: '',
    codEnabled: false,
    upiId: '',
    cashfreeOnlineReady: false,
    demoBuilderDraft: payload.demoBuilderDraft as DemoBusinessDraft,
  };

  return {
    ok: true,
    seed: {
      templateId: template.id,
      templateName: template.name,
      planCode: planCodeForTemplate(template.id),
      source: 'demo-storefront',
      sourceLabel: `Demo storefront · ${demoTenant.name}`,
      tenant: draftSectionsToTenant(draft, tenant),
      products: demo.products.map((product) => ({ ...product, id: product.id, tenantId: localId, active: true })),
      services: [],
      coupons: demo.coupons.map((coupon) => ({ ...coupon, tenantId: localId })),
      reviews: demo.reviews.map((review) => ({ ...review, tenantId: localId, websiteId: tenant.websiteId })),
      draft,
      transferNotes: [
        'Exact demo design, colours, typography, banner, logo, catalogue, prices, gallery, reviews and contact details copied into a local builder draft.',
        'Original public demo remains unchanged; this is an independent local copy.',
        'Demo checkout and form submissions remain disabled until a real customer site is saved and configured.',
        ...unsupportedSectionNotes(draft),
      ],
    },
  };
}

export function resolveTemplateHandoff(request: TemplateHandoffRequest): TemplateResolution {
  if (request.source === 'marketplace') {
    const template = findTemplate(request.templateId);
    if (!template) {
      return { ok: false, error: `Template "${request.templateId}" is unavailable. No substitute template was loaded.` };
    }
    return { ok: true, seed: createCatalogSeed(template) };
  }

  if (request.source === 'demo-storefront') {
    return createDemoSeed(request.slug);
  }

  const template = resolveLegacyThemeId(request.themeId);
  if (!template) {
    return {
      ok: false,
      error: `Legacy theme "${request.themeId}" has no verified catalogue mapping. No substitute template was loaded.`,
    };
  }
  const seed = seedFromDraft(
    template,
    createDraftFromTemplate(template),
    'theme-gallery',
    `Visual theme · ${request.themeId}`
  );
  return { ok: true, seed };
}

export function templatePlanCode(templateId: string): string {
  return planCodeForTemplate(templateId);
}

export function isSafeDemoTemplateSlug(slug: string): boolean {
  return Boolean(getDemoStorefront(slug) && DEMO_STORE_TEMPLATE_MAP[slug]);
}
