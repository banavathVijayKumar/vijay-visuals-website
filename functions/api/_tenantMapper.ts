// ============================================================================
// VIJAY VISUALS — SHARED PUBLIC TENANT MAPPER FOR CLOUDFLARE D1
// Maps customer_website_publications rows (and optional real D1 enrichments)
// into the exact TenantRecord shape expected by StorefrontView & Marketplace.
// NEVER invents fake product records, tenant IDs, payment settings, or data.
// ============================================================================

import { getPackageMonthlyAiCredits } from './_aiCredits';

export interface PublicationRow {
  rowid?: number | null;
  website_id: string;
  owner_id: string;
  public_slug: string;
  business_name: string;
  website_json: string;
  status: string;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BusinessProfileEnrichment {
  category?: string | null;
  description?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  branches_json?: string | null;
}

export interface SellerPayoutEnrichment {
  upi_id?: string | null;
  settlement_mode?: string | null;
  kyc_status?: string | null;
  linked_account_id?: string | null;
}

export interface TenantGlobalEnrichment {
  primary_currency?: string | null;
  timezone?: string | null;
  gsc_site_url?: string | null;
  gsc_verification_token?: string | null;
  gbp_profile_url?: string | null;
  gbp_place_id?: string | null;
}

export interface MappedGalleryItem {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface MappedTenantModules {
  ecommerce: boolean;
  cartCheckout: boolean;
  gallery: boolean;
  bookings: boolean;
  whatsappOrder: boolean;
  reviews: boolean;
  wishlist: boolean;
  coupons: boolean;
  wholesale: boolean;
}

export interface MappedTenantRecord {
  id: number;
  websiteId: string;
  ownerUserId: null;
  name: string;
  slug: string;
  category: string;
  templateId: string;
  templateName: string;
  templateFeatures: string[];
  tagline: string;
  description: string;
  logoText: string;
  logoImage: string;
  bannerImage: string;
  galleryImages: string[];
  galleryItems: MappedGalleryItem[];
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  customDomain: string;
  seoTitle: string;
  seoDescription: string;
  currency: string;
  language: string;
  timezone: string;
  phone: string;
  whatsapp: string;
  address: string;
  businessHours: string;
  deliveryInfo: string;
  returnPolicy: string;
  enabledModules: MappedTenantModules;
  socialLinks: {
    instagram?: string;
    facebook?: string;
    youtube?: string;
    website?: string;
  };
  sectionOrder: string[];
  customPages: Array<{ slug: string; title: string; content: string }>;
  published: boolean;
  planTier: 'website_only' | 'website_pwa' | 'enterprise_ai';
  pwaEnabled: boolean;
  pwaAppName: string;
  pwaShortName: string;
  pwaThemeColor: string;
  pwaLicenseKey: string;
  aiCreditsLimit: number;
  aiCreditsUsed: number;
  deliveryFee: number;
  deliveryCommissionPct: number;
  codEnabled: boolean;
  upiId: string;
  razorpayOnlineReady?: boolean;
  googleReviewUrl?: string;
  googlePlaceId?: string;
  createdAt: string;
}

const VALID_PLAN_TIERS = new Set(['website_only', 'website_pwa', 'enterprise_ai']);
const SAFE_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_IMAGE_DATA_REGEX = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;

export function cleanString(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function cleanColor(value: unknown, fallback: string): string {
  const s = cleanString(value, 32);
  return SAFE_COLOR_REGEX.test(s) ? s : fallback;
}

function cleanMediaSrc(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) {
    return trimmed.length <= 360_000 && SAFE_IMAGE_DATA_REGEX.test(trimmed) ? trimmed : '';
  }
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/images/')) {
    return trimmed.replace(/["'<>]/g, '').slice(0, 500);
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString().slice(0, 1000);
    }
  } catch {
    return '';
  }
  return '';
}

function cleanExternalUrl(value: unknown): string {
  const s = cleanString(value, 300);
  if (!s) return '';
  try {
    const u = new URL(s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString().slice(0, 300);
    }
  } catch {
    return '';
  }
  return '';
}

function cleanNonNegativeNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function computeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || 'VV').toUpperCase();
}

function defaultModulesForCategory(category: string): MappedTenantModules {
  const cat = category.toLowerCase();
  const isPortfolioOrService = [
    'photography',
    'video',
    'salon',
    'spa',
    'hotel',
    'hospital',
    'clinic',
    'dental',
    'real-estate',
    'travel',
    'education',
    'coaching',
    'gym',
    'fitness',
    'legal',
    'wedding',
    'event',
    'interior',
    'construction',
    'repair',
    'cleaning',
  ].some((k) => cat.includes(k));

  if (isPortfolioOrService) {
    return {
      ecommerce: false,
      cartCheckout: false,
      gallery: true,
      bookings: true,
      whatsappOrder: true,
      reviews: true,
      wishlist: false,
      coupons: false,
      wholesale: false,
    };
  }

  return {
    ecommerce: true,
    cartCheckout: true,
    gallery: true,
    bookings: false,
    whatsappOrder: true,
    reviews: true,
    wishlist: true,
    coupons: true,
    wholesale: false,
  };
}

function composeAddress(
  parsed: Record<string, any>,
  profile?: BusinessProfileEnrichment | null
): string {
  const explicitAddress =
    cleanString(parsed.address, 300) ||
    cleanString(profile?.address_line, 300);
  const city = cleanString(parsed.city, 100) || cleanString(profile?.city, 100);
  const state = cleanString(parsed.state, 100) || cleanString(profile?.state, 100);
  const pincode = cleanString(parsed.pincode, 20) || cleanString(profile?.pincode, 20);

  const parts: string[] = [];
  if (explicitAddress) parts.push(explicitAddress);
  const lowerCombined = () => parts.join(', ').toLowerCase();

  if (city && !lowerCombined().includes(city.toLowerCase())) {
    parts.push(city);
  }
  if (state && !lowerCombined().includes(state.toLowerCase())) {
    parts.push(state);
  }
  if (pincode && !lowerCombined().includes(pincode.toLowerCase())) {
    parts.push(pincode);
  }

  return parts.join(', ');
}

export function mapPublicationToTenant(
  row: PublicationRow,
  parsed: Record<string, any>,
  enrichment?: {
    profile?: BusinessProfileEnrichment | null;
    payout?: SellerPayoutEnrichment | null;
    globalSettings?: TenantGlobalEnrichment | null;
    razorpayOnlineReady?: boolean;
    aiCredits?: { limit: number; used: number } | null;
  }
): MappedTenantRecord {
  const profile = enrichment?.profile || null;
  const payout = enrichment?.payout || null;
  const globalSettings = enrichment?.globalSettings || null;

  const name =
    cleanString(parsed.businessName, 140) ||
    cleanString(parsed.name, 140) ||
    cleanString(row.business_name, 140) ||
    row.public_slug;

  const category =
    cleanString(parsed.category, 80) ||
    cleanString(profile?.category, 80) ||
    'other';

  const primaryColor = cleanColor(
    parsed.primaryColor || parsed.themeColor || parsed.brandColor,
    '#D4AF37'
  );
  const accentColor = cleanColor(parsed.accentColor, '#0D0D12');

  const templateObj =
    parsed.template && typeof parsed.template === 'object' ? parsed.template : null;
  const templateName = cleanString(templateObj?.name, 140);
  const templateId =
    cleanString(parsed.templateId, 100) ||
    cleanString(templateObj?.id, 100) ||
    templateName ||
    'obsidian-luxury';

  const templateFeatures = Array.isArray(templateObj?.features)
    ? templateObj.features
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim().slice(0, 120))
        .slice(0, 12)
    : [];

  const rawPlanTier = cleanString(parsed.planTier, 40);
  const planTier = (
    VALID_PLAN_TIERS.has(rawPlanTier) ? rawPlanTier : 'website_only'
  ) as MappedTenantRecord['planTier'];

  const rowId =
    typeof row.rowid === 'number' && Number.isFinite(row.rowid) && row.rowid > 0
      ? Math.trunc(row.rowid)
      : 0;

  // Never invent payment settings: only reflect explicitly saved values
  const codEnabled =
    parsed.codEnabled === true ||
    payout?.settlement_mode === 'cod_only';
  const upiId = cleanString(parsed.upiId, 120) || cleanString(payout?.upi_id, 120);

  // Gallery items & backward-compatible galleryImages
  const rawGalleryImages: string[] = Array.isArray(parsed.galleryImages)
    ? parsed.galleryImages
        .map((u: unknown) => cleanMediaSrc(u))
        .filter(Boolean)
        .slice(0, 18)
    : [];

  let galleryItems: MappedGalleryItem[] = [];
  if (Array.isArray(parsed.galleryItems) && parsed.galleryItems.length > 0) {
    galleryItems = parsed.galleryItems
      .map((item: any, idx: number) => {
        const url = cleanMediaSrc(item?.url);
        if (!url) return null;
        return {
          id: cleanString(item?.id, 60) || `gal_${idx + 1}`,
          url,
          title: cleanString(item?.title, 120),
          description: cleanString(item?.description, 400),
          category: cleanString(item?.category, 60) || 'Showcase',
          order: Number.isFinite(Number(item?.order)) ? Number(item.order) : idx,
        };
      })
      .filter((x: MappedGalleryItem | null): x is MappedGalleryItem => Boolean(x))
      .sort((a: MappedGalleryItem, b: MappedGalleryItem) => a.order - b.order)
      .slice(0, 18);
  } else if (rawGalleryImages.length > 0) {
    galleryItems = rawGalleryImages.map((url, idx) => ({
      id: `gal_${idx + 1}`,
      url,
      title: '',
      description: '',
      category: 'Showcase',
      order: idx,
    }));
  }

  const galleryImages =
    rawGalleryImages.length > 0
      ? rawGalleryImages
      : galleryItems.map((g) => g.url);

  const baseModules = defaultModulesForCategory(category);
  const rawMods =
    parsed.enabledModules && typeof parsed.enabledModules === 'object'
      ? (parsed.enabledModules as Record<string, unknown>)
      : {};
  const enabledModules: MappedTenantModules = {
    ecommerce: typeof rawMods.ecommerce === 'boolean' ? rawMods.ecommerce : baseModules.ecommerce,
    cartCheckout:
      typeof rawMods.cartCheckout === 'boolean' ? rawMods.cartCheckout : baseModules.cartCheckout,
    gallery: typeof rawMods.gallery === 'boolean' ? rawMods.gallery : baseModules.gallery,
    bookings: typeof rawMods.bookings === 'boolean' ? rawMods.bookings : baseModules.bookings,
    whatsappOrder:
      typeof rawMods.whatsappOrder === 'boolean' ? rawMods.whatsappOrder : baseModules.whatsappOrder,
    reviews: typeof rawMods.reviews === 'boolean' ? rawMods.reviews : baseModules.reviews,
    wishlist: typeof rawMods.wishlist === 'boolean' ? rawMods.wishlist : baseModules.wishlist,
    coupons: typeof rawMods.coupons === 'boolean' ? rawMods.coupons : baseModules.coupons,
    wholesale: typeof rawMods.wholesale === 'boolean' ? rawMods.wholesale : baseModules.wholesale,
  };

  const rawSocials =
    parsed.socialLinks && typeof parsed.socialLinks === 'object' ? parsed.socialLinks : {};
  const socialLinks = {
    instagram: cleanExternalUrl(rawSocials.instagram) || undefined,
    facebook: cleanExternalUrl(rawSocials.facebook) || undefined,
    youtube: cleanExternalUrl(rawSocials.youtube) || undefined,
    website: cleanExternalUrl(rawSocials.website) || undefined,
  };

  const sectionOrder = Array.isArray(parsed.sectionOrder)
    ? parsed.sectionOrder
        .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s: string) => s.trim().slice(0, 40))
        .slice(0, 12)
    : ['hero', 'catalog', 'gallery', 'booking', 'contact'];

  const customPages = Array.isArray(parsed.customPages)
    ? parsed.customPages
        .filter((p: any) => p && typeof p === 'object' && p.slug && p.title)
        .map((p: any) => ({
          slug: cleanString(p.slug, 40),
          title: cleanString(p.title, 80),
          content: cleanString(p.content, 2000),
        }))
        .slice(0, 10)
    : [];

  return {
    id: rowId,
    websiteId: row.website_id,
    ownerUserId: null,
    name,
    slug: row.public_slug,
    category,
    templateId,
    templateName,
    templateFeatures,
    tagline: cleanString(parsed.tagline, 240) || cleanString(parsed.subtitle, 240),
    description:
      cleanString(parsed.description, 1200) ||
      cleanString(parsed.about, 1200) ||
      cleanString(profile?.description, 1200),
    logoText: cleanString(parsed.logoText, 8) || computeInitials(name),
    logoImage: cleanMediaSrc(parsed.logoImage),
    bannerImage:
      cleanMediaSrc(parsed.bannerImage) ||
      cleanMediaSrc(parsed.heroImage) ||
      cleanString(parsed.bannerImage, 1000) ||
      cleanString(parsed.heroImage, 1000),
    galleryImages,
    galleryItems,
    primaryColor,
    accentColor,
    fontFamily: cleanString(parsed.fontFamily, 60) || 'Cinzel',
    customDomain: cleanString(parsed.customDomain, 200),
    seoTitle: cleanString(parsed.seoTitle, 160) || cleanString(profile?.seo_title, 160),
    seoDescription:
      cleanString(parsed.seoDescription, 320) ||
      cleanString(profile?.seo_description, 320),
    currency:
      cleanString(parsed.currency, 10) ||
      cleanString(globalSettings?.primary_currency, 10) ||
      'INR',
    language: ['en', 'te', 'hi'].includes(String(parsed.language || ''))
      ? String(parsed.language)
      : 'en',
    timezone:
      cleanString(parsed.timezone, 60) ||
      cleanString(globalSettings?.timezone, 60) ||
      'Asia/Kolkata',
    phone:
      cleanString(parsed.phone, 40) ||
      cleanString(parsed.contactPhone, 40) ||
      cleanString(profile?.phone, 40),
    whatsapp:
      cleanString(parsed.whatsapp, 40) ||
      cleanString(parsed.whatsappNumber, 40) ||
      cleanString(profile?.whatsapp_number, 40),
    address: composeAddress(parsed, profile),
    businessHours: cleanString(parsed.businessHours, 200),
    deliveryInfo: cleanString(parsed.deliveryInfo, 600),
    returnPolicy: cleanString(parsed.returnPolicy, 800),
    enabledModules,
    socialLinks,
    sectionOrder,
    customPages,
    published: row.status === 'published',
    planTier,
    pwaEnabled: parsed.pwaEnabled === true,
    pwaAppName: cleanString(parsed.pwaAppName, 100) || name,
    pwaShortName: cleanString(parsed.pwaShortName, 24) || name.slice(0, 12),
    pwaThemeColor: cleanColor(parsed.pwaThemeColor, primaryColor),
    pwaLicenseKey: '',
    aiCreditsLimit:
      enrichment?.aiCredits?.limit ?? getPackageMonthlyAiCredits(planTier),
    aiCreditsUsed: enrichment?.aiCredits?.used ?? 0,
    deliveryFee: cleanNonNegativeNumber(parsed.deliveryFee),
    deliveryCommissionPct: cleanNonNegativeNumber(parsed.deliveryCommissionPct),
    codEnabled,
    upiId,
    razorpayOnlineReady: Boolean(enrichment?.razorpayOnlineReady),
    googleReviewUrl: cleanString(parsed.googleReviewUrl || parsed.googleMapsUrl || enrichment?.globalSettings?.gbp_profile_url, 400),
    googlePlaceId: cleanString(parsed.googlePlaceId || enrichment?.globalSettings?.gbp_place_id, 100),
    createdAt:
      row.published_at || row.created_at || row.updated_at || '',
  };
}
