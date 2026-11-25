// ============================================================================
// Storefront metadata helper — removes platform OG/Twitter attribution from
// /site/{slug} storefronts and applies tenant-owned metadata instead.
// Pure DOM mutations so the behavior can be tested without a React renderer.
// ============================================================================

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

export function applyStorefrontMetadata(
  doc: Document,
  input: StorefrontMetadataInput
): () => void {
  const metaChanges = new Map<string, MetaChange>();
  const createdNodes: Element[] = [];
  const removedScripts: HTMLScriptElement[] = [];

  const computeTitle =
    input.seoTitle || `${input.name}${input.tagline || input.category ? ` — ${input.tagline || input.category}` : ''}`;
  const computeDescription = input.seoDescription || input.description || input.tagline || '';
  const canonical = input.canonicalUrl;
  const tenantImage = input.bannerImage || '';

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

  setMeta('name', 'description', computeDescription);
  setMeta('name', 'robots', input.robotsDirectives || 'index, follow');
  setMeta('name', 'application-name', input.name);
  setMeta('name', 'apple-mobile-web-app-title', input.name);
  setMeta('name', 'theme-color', input.primaryColor);
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

  // Tenant SEO settings are plain strings. A relative/malformed canonical must
  // never throw inside the effect and blank the storefront.
  let canonicalOrigin = '';
  try {
    canonicalOrigin = new URL(canonical).origin;
  } catch {
    canonicalOrigin = '';
  }

  const jsonLdGraph: Array<Record<string, unknown>> = [
    {
      '@type': input.localBusinessType || 'LocalBusiness',
      name: input.name,
      description: computeDescription,
      url: canonical,
      telephone: input.phone,
      address: {
        '@type': 'PostalAddress',
        streetAddress: input.address,
        addressCountry: 'IN',
      },
      ...(input.googleMapsUrl ? { hasMap: input.googleMapsUrl } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: input.name, item: canonicalOrigin || canonical },
        { '@type': 'ListItem', position: 2, name: input.name, item: canonical },
      ],
    },
    ...input.products.slice(0, 12).map((product) => ({
      '@type': 'Product',
      name: product.name,
      description: product.description,
      image: product.imageUrl || tenantImage,
      offers: {
        '@type': 'Offer',
        priceCurrency: input.currency || 'INR',
        price: product.price,
        availability: Number(product.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    })),
  ];

  const tenantScript = doc.createElement('script');
  tenantScript.id = 'vv-storefront-jsonld';
  tenantScript.type = 'application/ld+json';
  tenantScript.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonLdGraph });
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
    if (canonicalElement) {
      if (previousCanonical) canonicalElement.setAttribute('href', previousCanonical);
      else canonicalElement.remove();
    }
    for (const node of createdNodes) node.remove();
    for (const script of removedScripts) doc.head.appendChild(script);
  };
}
