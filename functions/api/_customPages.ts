// ============================================================================
// Shared custom-page sanitizer for tenant website JSON.
// Pages are presentation content stored inside website_json; this module gives
// every writer/reader one safe, backward-compatible shape. No HTML is stored.
// ============================================================================

export const CUSTOM_PAGE_SECTION_IDS = [
  'home',
  'catalog',
  'gallery',
  'booking',
  'reviews',
  'contact',
] as const;

export type CustomPageBlockType = 'heading' | 'text' | 'list' | 'image' | 'link' | 'callout';

export interface CustomPageBlock {
  type: CustomPageBlockType;
  text: string;
  items: string[];
  url: string;
  alt: string;
}

export interface CustomPage {
  slug: string;
  title: string;
  content: string;
  inNav: boolean;
  blocks: CustomPageBlock[];
}

const MAX_PAGES = 12;
const MAX_BLOCKS_PER_PAGE = 12;
const MAX_LIST_ITEMS = 12;
const BLOCK_TYPES = new Set<CustomPageBlockType>([
  'heading',
  'text',
  'list',
  'image',
  'link',
  'callout',
]);
const RESERVED_SLUGS = new Set<string>(CUSTOM_PAGE_SECTION_IDS);
const SAFE_HTTPS = /^https:\/\/[^\s<>"']{1,390}$/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{1,50000}$/i;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const plainText = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
};

const safeHttpsUrl = (value: unknown): string => {
  const text = plainText(value, 400);
  return SAFE_HTTPS.test(text) ? text : '';
};

const safeMediaUrl = (value: unknown): string => {
  const text = plainText(value, 50000);
  return SAFE_HTTPS.test(text) || SAFE_DATA_IMAGE.test(text) ? text : '';
};

const safePageHref = (value: unknown): string => {
  const text = plainText(value, 400);
  if (/^#page-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) return text;
  return safeHttpsUrl(text);
};

const normalizeSlug = (value: unknown): string => {
  const slug = plainText(value, 60)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return '';
  return RESERVED_SLUGS.has(slug) ? `page-${slug}` : slug;
};

const sanitizeBlock = (value: unknown): CustomPageBlock | null => {
  const raw = asObject(value);
  if (!raw) return null;
  const type = plainText(raw.type, 20).toLowerCase() as CustomPageBlockType;
  if (!BLOCK_TYPES.has(type)) return null;

  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => plainText(item, 240))
        .filter(Boolean)
        .slice(0, MAX_LIST_ITEMS)
    : [];

  const block: CustomPageBlock = {
    type,
    text: plainText(raw.text, type === 'heading' ? 120 : 1200),
    items,
    url: type === 'image' ? safeMediaUrl(raw.url || raw.src) : safePageHref(raw.url),
    alt: type === 'image' ? plainText(raw.alt, 160) : '',
  };

  if (type === 'link' && !block.url) return null;
  if (type === 'image' && !block.url) return null;
  if (!block.text && block.items.length === 0 && !block.url) return null;
  return block;
};

/**
 * Returns a canonical, render-safe page list. Legacy `{slug,title,content}`
 * entries remain valid; new `inNav` and `blocks` fields are additive.
 */
export function sanitizeCustomPages(raw: unknown): CustomPage[] {
  if (!Array.isArray(raw)) return [];

  const slugs = new Set<string>();
  const pages: CustomPage[] = [];

  for (const entry of raw) {
    if (pages.length >= MAX_PAGES) break;
    const page = asObject(entry);
    if (!page) continue;

    const slug = normalizeSlug(page.slug);
    const title = plainText(page.title, 80);
    if (!slug || !title || slugs.has(slug)) continue;
    slugs.add(slug);

    const blocks = Array.isArray(page.blocks)
      ? page.blocks
          .map(sanitizeBlock)
          .filter((block): block is CustomPageBlock => Boolean(block))
          .slice(0, MAX_BLOCKS_PER_PAGE)
      : [];

    pages.push({
      slug,
      title,
      content: plainText(page.content, 2000),
      inNav: page.inNav !== false,
      blocks,
    });
  }

  return pages;
}
