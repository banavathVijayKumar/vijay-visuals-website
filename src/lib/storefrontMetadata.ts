// ============================================================================
// Storefront metadata helper — removes platform OG/Twitter attribution from
// /site/{slug} storefronts and applies tenant-owned metadata instead.
// Canonical/robots/JSON-LD rules are imported from the shared SEO module used
// by the edge, so hydrated DOM cannot disagree with server-rendered HTML.
// Pure DOM mutations keep this testable without a React renderer.
// ============================================================================

import { buildTenantStructuredData, normalizeTenantRobots } from '../../shared/seo';

export interface StorefrontMetadataProduct {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number | string;
  stock: number;
}

export interface StorefrontMetadataInput {
  name: string;
  slug: string;
  tagline?: string | null;
  category?: string | null;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  phone?: string | null;
  address?: string | null;
  bannerImage?: string | null;
  primaryColor?: string | null;
  currency?: string | null;
  canonicalUrl: string;
  robotsDirectives?: string | null;
  googleSiteVerification?: string | null;
  googleMapsUrl?: string | null;
  localBusinessType?: string | null;
  products: StorefrontMetadataProduct[];
}

interface MetaChange {
  element: HTMLMetaElement;
  previousContent: string | null;
  created: boolean;
  removed: boolean;
  previousParent: Node | null;
}

interface LinkChange {
  element: HTMLLinkElement;
  previousParent: Node | null;
}

export function applyStorefrontMetadata(
  doc: Document,
  input: StorefrontMetadataInput
): () => void {
  const metaChanges = new Map<string, MetaChange>();
  const createdNodes: Element[] = [];
  const removedScripts: HTMLScriptElement[] = [];
  const removedAlternates: LinkChange[] = [];
  const removedBrandLinks: LinkChange[] = [];

  const computeTitle =
    input.seoTitle || `${input.name}${input.tagline || input.category ? ` — ${input.tagline || input.category}` : ''}`;
  const computeDescription = input.seoDescription || input.description || input.tagline || '';
  const canonical = input.canonicalUrl;
  const tenantImage = input.bannerImage || '';
  const robots = normalizeTenantRobots(input.robotsDirectives);

  const setMeta = (attribute: 'name' | 'property', key: string, value?: string | null): void => {
    const changeKey = `${attribute}:${key}`;
    let element = doc.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    const change: MetaChange = element
      ? {
          element,
          previousContent: element.getAttribute('content'),
          created: false,
          removed: false,
          previousParent: element.parentNode,
        }
      : {
          element: doc.createElement('meta'),
          previousContent: null,
          created: true,
          removed: false,
          previousParent: null,
        };

    if (!element) {
      element = change.element;
      element.setAttribute(attribute, key);
      doc.head.appendChild(element);
      createdNodes.push(element);
    }

    if (value) {
      element.setAttribute('content', value);
    } else {
      change.previousParent = element.parentNode;
      change.removed = true;
      element.remove();
    }
    metaChanges.set(changeKey, change);
  };

  const previousTitle = doc.title;
  doc.title = computeTitle;

  setMeta('name', 'vv-tenant-metadata', 'client-hydrated');
  setMeta('name', 'description', computeDescription);
  setMeta('name', 'robots', robots);
  setMeta('name', 'application-name', input.name);
  setMeta('name', 'apple-mobile-web-app-title', input.name);
  setMeta('name', 'theme-color', input.primaryColor);
  // An empty tenant token must remove the platform token, not fall back to it.
  setMeta('name', 'google-site-verification', input.googleSiteVerification);

  // Overwrite every platform-owned social tag; remove values the tenant does not own.
  setMeta('property', 'og:site_name', input.name);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:title', computeTitle);
  setMeta('property', 'og:description', computeDescription);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:image', tenantImage);
  setMeta('property', 'og:image:alt', tenantImage ? input.name : '');
  setMeta('property', 'og:locale', '');
  setMeta('name', 'twitter:card', tenantImage ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', computeTitle);
  setMeta('name', 'twitter:description', computeDescription);
  setMeta('name', 'twitter:url', canonical);
  setMeta('name', 'twitter:image', tenantImage);
  setMeta('name', 'twitter:image:alt', tenantImage ? input.name : '');
  setMeta('name', 'twitter:site', '');

  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]'))) {
    const previousParent = link.parentNode;
    link.remove();
    removedAlternates.push({ element: link, previousParent });
  }

  // Client-side hydration must not leave the platform favicon, touch icon, or
  // PWA manifest attached to a tenant-owned document. Restore them on cleanup.
  const brandLinkSelectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="manifest"]',
  ];
  for (const selector of brandLinkSelectors) {
    for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>(selector))) {
      const previousParent = link.parentNode;
      link.remove();
      removedBrandLinks.push({ element: link, previousParent });
    }
  }
  if (tenantImage) {
    for (const rel of ['icon', 'apple-touch-icon'] as const) {
      const icon = doc.createElement('link');
      icon.setAttribute('rel', rel);
      icon.setAttribute('href', tenantImage);
      icon.setAttribute('data-vv-tenant-icon', 'true');
      doc.head.appendChild(icon);
      createdNodes.push(icon);
    }
  }

  let canonicalElement = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const previousCanonical = canonicalElement?.getAttribute('href') || '';
  if (!canonicalElement) {
    canonicalElement = doc.createElement('link');
    canonicalElement.setAttribute('rel', 'canonical');
    doc.head.appendChild(canonicalElement);
    createdNodes.push(canonicalElement);
  }
  canonicalElement.setAttribute('href', canonical);

  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
    if (script.id === 'vv-storefront-jsonld') continue;
    script.remove();
    removedScripts.push(script);
  }

  const structuredData = buildTenantStructuredData({
    name: input.name,
    description: computeDescription,
    phone: input.phone,
    address: input.address,
    addressCountry: 'IN',
    canonicalUrl: canonical,
    localBusinessType: input.localBusinessType,
    googleMapsUrl: input.googleMapsUrl,
    currency: input.currency,
    products: input.products.map((product) => ({
      ...product,
      imageUrl: product.imageUrl || tenantImage,
    })),
  });

  const tenantScript = doc.createElement('script');
  tenantScript.id = 'vv-storefront-jsonld';
  tenantScript.type = 'application/ld+json';
  tenantScript.textContent = structuredData;
  doc.head.appendChild(tenantScript);
  createdNodes.push(tenantScript);

  return () => {
    doc.title = previousTitle;
    for (const change of metaChanges.values()) {
      if (!change.created && change.removed && change.previousParent) {
        change.previousParent.appendChild(change.element);
        change.removed = false;
      }
      if (change.created) {
        change.element.remove();
      } else if (change.previousContent !== null) {
        change.element.setAttribute('content', change.previousContent);
      } else {
        change.element.removeAttribute('content');
      }
    }
    for (const link of removedAlternates) {
      link.previousParent?.appendChild(link.element);
    }
    for (const link of removedBrandLinks) {
      link.previousParent?.appendChild(link.element);
    }
    if (canonicalElement) {
      if (previousCanonical) canonicalElement.setAttribute('href', previousCanonical);
      else canonicalElement.remove();
    }
    for (const node of createdNodes) node.remove();
    for (const script of removedScripts) doc.head.appendChild(script);
  };
}
