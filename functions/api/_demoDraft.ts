// ============================================================================
// Shared sanitizer for Demo Business Builder drafts.
// Drafts are stored inside the tenant's own website_json record, so the same
// owner/member authorization and unpublished-only rules apply automatically.
// No provider call, publication, or cross-tenant read is performed here.
// ============================================================================

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_IMAGE_DATA = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_LOCAL_IMAGE = /^\/[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp)$/i;
const ALLOWED_CATEGORY_IDS = new Set([
  'clothing', 'grocery', 'electronics', 'restaurant', 'hotel', 'photography', 'real_estate',
  'education', 'beauty_salon', 'gym', 'travel', 'automobile', 'freelancer',
  'professional_services', 'wholesale', 'other',
]);
const ALLOWED_SECTIONS = new Set([
  'hero', 'catalog', 'gallery', 'about', 'booking', 'process', 'faq', 'contact', 'map',
]);
const ALLOWED_BUTTON_STYLES = new Set(['rounded', 'pill', 'square']);
const ALLOWED_HEADER_STYLES = new Set(['standard', 'minimal', 'bold']);
const ALLOWED_FOOTER_STYLES = new Set(['simple', 'detailed', 'minimal']);
const ALLOWED_SPACING = new Set(['compact', 'comfortable', 'spacious']);
const ALLOWED_LAYOUTS = new Set(['grid', 'list', 'cards']);

function text(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  // Stored draft values are plain text. Remove control characters and angle
  // brackets so an uploaded draft can never carry executable-looking markup.
  return value.replace(/[\u0000-\u001F\u007F<>]/g, ' ').trim().slice(0, max);
}

function color(value: unknown, fallback: string): string {
  const v = text(value, 32);
  return SAFE_COLOR.test(v) ? v : fallback;
}

function image(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim().slice(0, 360_000);
  if (SAFE_IMAGE_DATA.test(v) || SAFE_LOCAL_IMAGE.test(v)) return v;
  if (v.startsWith('https://')) {
    try {
      const parsed = new URL(v);
      if (parsed.protocol === 'https:') return parsed.toString().slice(0, 1000);
    } catch {
      return '';
    }
  }
  return '';
}

function safeUrl(value: unknown): string {
  const v = text(value, 500);
  if (!v.startsWith('https://')) return '';
  try {
    const parsed = new URL(v);
    return parsed.protocol === 'https:' ? parsed.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

function stringList(value: unknown, maxItems: number, maxLen = 160): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => text(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export interface SanitizedDemoDraft {
  id: string;
  slug: string;
  categoryId: string;
  templateId: string;
  templateName: string;
  identity: {
    businessName: string;
    tagline: string;
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    mapUrl: string;
    businessHours: string;
    logoImage: string;
  };
  design: {
    primaryColor: string;
    accentColor: string;
    background: string;
    fontFamily: string;
    buttonStyle: string;
    headerStyle: string;
    footerStyle: string;
    spacing: string;
    sectionLayout: string;
  };
  content: {
    heroHeadline: string;
    heroSubheadline: string;
    aboutText: string;
    bannerImage: string;
    galleryImages: string[];
  };
  items: Array<{
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
    image: string;
    sizes: string[];
    colors: string[];
    options: string[];
  }>;
  sections: Array<{ id: string; title: string; visible: boolean; layout: string }>;
  updatedAt: string;
}

/**
 * Returns undefined when the payload is not a recognizable draft. Existing
 * tenant records without this field remain unchanged.
 */
export function sanitizeDemoDraftForStorage(value: unknown): SanitizedDemoDraft | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, any>;
  const categoryId = text(raw.categoryId, 40);
  const templateId = text(raw.templateId, 100);
  if (!ALLOWED_CATEGORY_IDS.has(categoryId) || !templateId) return undefined;

  const identity = raw.identity && typeof raw.identity === 'object' ? raw.identity : {};
  const design = raw.design && typeof raw.design === 'object' ? raw.design : {};
  const content = raw.content && typeof raw.content === 'object' ? raw.content : {};

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((item: any) => item && typeof item === 'object')
        .slice(0, 24)
        .map((item: any, idx: number) => ({
          id: text(item.id, 60) || `item-${idx + 1}`,
          name: text(item.name, 120),
          description: text(item.description, 500),
          price: text(item.price, 40),
          category: text(item.category, 80),
          image: image(item.image),
          sizes: stringList(item.sizes, 12, 40),
          colors: stringList(item.colors, 12, 40),
          options: stringList(item.options, 12, 80),
        }))
        .filter((item: any) => item.name)
    : [];

  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .filter((section: any) => section && typeof section === 'object' && ALLOWED_SECTIONS.has(String(section.id || '')))
        .slice(0, 12)
        .map((section: any) => ({
          id: String(section.id),
          title: text(section.title, 120),
          visible: section.visible !== false,
          layout: ALLOWED_LAYOUTS.has(String(section.layout || '')) ? String(section.layout) : 'grid',
        }))
    : [];

  return {
    id: text(raw.id, 80),
    slug: text(raw.slug, 120).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120),
    categoryId,
    templateId,
    templateName: text(raw.templateName, 140),
    identity: {
      businessName: text(identity.businessName, 140),
      tagline: text(identity.tagline, 240),
      email: text(identity.email, 140),
      phone: text(identity.phone, 40),
      whatsapp: text(identity.whatsapp, 40),
      address: text(identity.address, 300),
      mapUrl: safeUrl(identity.mapUrl),
      businessHours: text(identity.businessHours, 200),
      logoImage: image(identity.logoImage),
    },
    design: {
      primaryColor: color(design.primaryColor, '#D4AF37'),
      accentColor: color(design.accentColor, '#0D0D12'),
      background: color(design.background, '#0B0B10'),
      fontFamily: ALLOWED_LAYOUTS.has(String(design.fontFamily || ''))
        ? String(design.fontFamily)
        : ['Cinzel', 'Plus Jakarta Sans', 'Inter', 'Georgia'].includes(String(design.fontFamily || ''))
          ? String(design.fontFamily)
          : 'Cinzel',
      buttonStyle: ALLOWED_BUTTON_STYLES.has(String(design.buttonStyle || '')) ? String(design.buttonStyle) : 'rounded',
      headerStyle: ALLOWED_HEADER_STYLES.has(String(design.headerStyle || '')) ? String(design.headerStyle) : 'standard',
      footerStyle: ALLOWED_FOOTER_STYLES.has(String(design.footerStyle || '')) ? String(design.footerStyle) : 'simple',
      spacing: ALLOWED_SPACING.has(String(design.spacing || '')) ? String(design.spacing) : 'comfortable',
      sectionLayout: ALLOWED_LAYOUTS.has(String(design.sectionLayout || '')) ? String(design.sectionLayout) : 'grid',
    },
    content: {
      heroHeadline: text(content.heroHeadline, 240),
      heroSubheadline: text(content.heroSubheadline, 600),
      aboutText: text(content.aboutText, 1200),
      bannerImage: image(content.bannerImage),
      galleryImages: Array.isArray(content.galleryImages)
        ? content.galleryImages.map(image).filter(Boolean).slice(0, 18)
        : [],
    },
    items,
    sections,
    updatedAt: text(raw.updatedAt, 40),
  };
}
