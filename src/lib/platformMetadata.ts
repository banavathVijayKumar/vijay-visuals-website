// ============================================================================
// Platform head metadata for client-side language/view transitions.
// Rules come from shared/seo.ts so browser state matches edge-rendered HTML.
// Platform GSC tokens and PWA tags are never removed.
// ============================================================================

import { Lang } from '../data/content';
import { OFFICIAL_SITE_URL, getPlatformSeoMeta as getPlatformMetaRules } from '../../shared/seo';

interface MetaChange {
  element: HTMLMetaElement;
  previousContent: string | null;
  created: boolean;
  previousParent: Node | null;
}

interface LinkChange {
  element: HTMLLinkElement;
  previousHref: string | null;
  created: boolean;
  previousParent: Node | null;
}

export function applyPlatformMetadata(
  doc: Document,
  pathname: string,
  lang: Lang,
  hasExplicitLang: boolean
): () => void {
  const meta = getPlatformMetaRules(OFFICIAL_SITE_URL, pathname, lang, hasExplicitLang);
  const metaChanges = new Map<string, MetaChange>();
  const createdNodes: Element[] = [];
  const alternateChanges: LinkChange[] = [];
  const previousTitle = doc.title;
  const previousHtmlLang = doc.documentElement.lang;
  const previousHtmlDir = doc.documentElement.dir;

  const setMeta = (attribute: 'name' | 'property', key: string, value: string): void => {
    const changeKey = `${attribute}:${key}`;
    let element = doc.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = doc.createElement('meta');
      element.setAttribute(attribute, key);
      doc.head.appendChild(element);
      createdNodes.push(element);
      metaChanges.set(changeKey, {
        element,
        previousContent: null,
        created: true,
        previousParent: null,
      });
    } else if (!metaChanges.has(changeKey)) {
      metaChanges.set(changeKey, {
        element,
        previousContent: element.getAttribute('content'),
        created: false,
        previousParent: element.parentNode,
      });
    }
    element.setAttribute('content', value);
  };

  doc.title = meta.title;
  doc.documentElement.lang = meta.lang;
  doc.documentElement.dir = meta.dir;
  setMeta('name', 'description', meta.description);
  setMeta('name', 'robots', meta.robots);
  setMeta('property', 'og:site_name', 'Vijay Visuals');
  setMeta('property', 'og:url', meta.canonicalUrl);
  setMeta('property', 'og:title', meta.title);
  setMeta('property', 'og:description', meta.description);
  setMeta('name', 'twitter:title', meta.title);
  setMeta('name', 'twitter:description', meta.description);

  let canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const canonicalChange: LinkChange = canonical
    ? {
        element: canonical,
        previousHref: canonical.getAttribute('href'),
        created: false,
        previousParent: canonical.parentNode,
      }
    : {
        element: doc.createElement('link'),
        previousHref: null,
        created: true,
        previousParent: null,
      };
  if (!canonical) {
    canonical = canonicalChange.element;
    canonical.setAttribute('rel', 'canonical');
    doc.head.appendChild(canonical);
    createdNodes.push(canonical);
  }
  canonical.setAttribute('href', meta.canonicalUrl);

  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]'))) {
    const parent = link.parentNode;
    link.remove();
    alternateChanges.push({
      element: link,
      previousHref: link.getAttribute('href'),
      created: false,
      previousParent: parent,
    });
  }
  for (const link of meta.hreflang) {
    const element = doc.createElement('link');
    element.setAttribute('rel', 'alternate');
    element.setAttribute('hreflang', link.hreflang);
    element.setAttribute('href', link.href);
    doc.head.appendChild(element);
    createdNodes.push(element);
    alternateChanges.push({
      element,
      previousHref: null,
      created: true,
      previousParent: null,
    });
  }

  let script = doc.querySelector<HTMLScriptElement>('script#vv-platform-jsonld');
  const previousScriptText = script?.textContent || null;
  if (!script && meta.structuredData) {
    script = doc.createElement('script');
    script.id = 'vv-platform-jsonld';
    script.type = 'application/ld+json';
    doc.head.appendChild(script);
    createdNodes.push(script);
  }
  if (script) script.textContent = meta.structuredData;

  return () => {
    doc.title = previousTitle;
    doc.documentElement.lang = previousHtmlLang;
    doc.documentElement.dir = previousHtmlDir;
    for (const change of metaChanges.values()) {
      if (change.created) change.element.remove();
      else if (change.previousContent !== null) change.element.setAttribute('content', change.previousContent);
      else change.element.removeAttribute('content');
    }
    if (canonical) {
      if (canonicalChange.created) canonical.remove();
      else if (canonicalChange.previousHref) canonical.setAttribute('href', canonicalChange.previousHref);
      else canonical.removeAttribute('href');
    }
    for (const change of alternateChanges) {
      if (change.created) change.element.remove();
      else change.previousParent?.appendChild(change.element);
    }
    if (script) {
      if (previousScriptText !== null) script.textContent = previousScriptText;
      else script.remove();
    }
    for (const node of createdNodes) {
      if (node.isConnected) node.remove();
    }
  };
}
