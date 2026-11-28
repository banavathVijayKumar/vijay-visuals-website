import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Heart,
  Image as ImageIcon,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  Minus,
  Navigation,
  Phone,
  Plus,
  Printer,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getTenantFontStack } from '../lib/fontStacks';
import { initiateCashfreeStorefrontCheckout } from '../lib/cashfreeClient';
import { requestSingleGpsPosition, reverseGeocodeViaProxy } from '../lib/mapsClient';
import { applyStorefrontMetadata } from '../lib/storefrontMetadata';
import { useAuth } from '../hooks/useAuth';
import { Lang } from '../data/content';
import { OFFICIAL_SITE_URL, resolveTenantCanonicalUrl } from '../../shared/seo';
import { validateIndiaWhatsAppNumber } from '../../shared/indiaWhatsapp';
import {
  CartItem,
  CouponRecord,
  GalleryItem,
  OrderRecord,
  ProductRecord,
  ReviewRecord,
  TenantLogoConfig,
  TenantModules,
  TenantRecord,
} from '../types/platform';
import { getDemoStorefront } from '../data/demo';
import { PWAInstallButton } from './PWAControls';
import { StorefrontMapPreview } from './StorefrontMapPreview';
import { StorefrontReviews } from './StorefrontReviews';
import restaurantFallbackBanner from '../assets/images/store_gourmet_dining_1795055802368.jpg';
import fashionFallbackBanner from '../assets/images/store_fashion_royal_1795055802960.jpg';
import groceryFallbackBanner from '../assets/images/store_grocery_organic_1795055803860.jpg';
import electronicsFallbackBanner from '../assets/images/store_electronics_audio_1795055804216.jpg';

function getCategoryFallbackBanner(category: string): string {
  const c = (category || '').toLowerCase();
  if (c.includes('restaurant') || c.includes('cafe') || c.includes('food') || c.includes('bakery')) {
    return restaurantFallbackBanner;
  }
  if (c.includes('cloth') || c.includes('fashion') || c.includes('salon') || c.includes('beauty')) {
    return fashionFallbackBanner;
  }
  if (c.includes('grocery') || c.includes('organic') || c.includes('mart') || c.includes('wholesale')) {
    return groceryFallbackBanner;
  }
  if (c.includes('electronic') || c.includes('tech') || c.includes('gym') || c.includes('education')) {
    return electronicsFallbackBanner;
  }
  // Generic category artwork only; no platform-specific hero asset is shown
  // on a customer's white-label storefront.
  return electronicsFallbackBanner;
}

function buildWhatsAppUrl(
  whatsapp: string,
  phone: string,
  currency: string | undefined,
  tenantName: string,
  customMessage?: string
): string {
  let digits = (whatsapp || '').replace(/\D/g, '');
  if (!digits) return '';
  const likelyIndia = (phone || '').trim().startsWith('+91') || !currency || currency.toUpperCase() === 'INR';
  if (digits.length === 10 && likelyIndia) {
    digits = `91${digits}`;
  }
  const msg = encodeURIComponent(
    customMessage || `Hi ${tenantName}, I found your website and would like to enquire.`
  );
  return `https://wa.me/${digits}?text=${msg}`;
}

function resolveTenantModules(tenant: TenantRecord | null): TenantModules {
  if (tenant?.enabledModules) return tenant.enabledModules;
  return {
    ecommerce: true,
    cartCheckout: true,
    gallery: true,
    bookings: true,
    whatsappOrder: true,
    reviews: true,
    wishlist: true,
    coupons: true,
    wholesale: false,
  };
}

function logoShapeStyle(shape: TenantLogoConfig['badgeShape']): React.CSSProperties {
  switch (shape) {
    case 'rounded_square':
      return { borderRadius: '0.65rem' };
    case 'minimal_frame':
      return { borderRadius: '0.2rem', background: 'transparent', borderWidth: 2, borderStyle: 'solid' };
    case 'shield':
      return { borderRadius: '0.75rem 0.75rem 1.5rem 1.5rem' };
    case 'hexagon':
      return { clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)', borderRadius: 0 };
    default:
      return { borderRadius: '9999px' };
  }
}

function StorefrontLogo({
  tenant,
  variant,
}: {
  tenant: TenantRecord;
  variant: 'compact' | 'hero';
}) {
  const cfg = tenant.logoConfig;
  const compact = variant === 'compact';
  const imageUrl =
    cfg?.type === 'image' && cfg.imageUrl ? cfg.imageUrl : tenant.logoImage || '';
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={tenant.name}
        width={compact ? 36 : 48}
        height={compact ? 36 : 48}
        loading="lazy"
        decoding="async"
        className={compact ? 'h-9 w-9 rounded-lg object-cover border border-white/15 shrink-0' : 'h-12 w-12 rounded-lg object-cover border border-white/15 shrink-0'}
      />
    );
  }

  const initials = cfg?.initials || tenant.logoText;
  const badgeSize =
    cfg?.size === 'sm'
      ? 'h-9 w-9 text-[10px]'
      : cfg?.size === 'lg'
        ? 'h-14 w-14 text-sm'
        : 'h-12 w-12 text-xs';
  const badge = (sizeClass: string) => (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center font-bold`}
      style={{
        ...logoShapeStyle(cfg?.badgeShape || 'circle'),
        backgroundColor: cfg?.badgeShape === 'minimal_frame' ? undefined : cfg?.badgeBgColor || tenant.primaryColor,
        borderColor: cfg?.badgeBorderColor || tenant.primaryColor,
        color: cfg?.badgeTextColor || '#08080A',
        fontFamily: getTenantFontStack(cfg?.fontFamily || tenant.fontFamily),
        letterSpacing:
          cfg?.letterSpacing === 'tight'
            ? '-0.02em'
            : cfg?.letterSpacing === 'normal'
              ? '0'
              : cfg?.letterSpacing === 'luxury'
                ? '0.18em'
                : '0.08em',
      }}
    >
      {initials}
    </span>
  );

  if (cfg && cfg.layout === 'text_only') {
    return (
      <span
        className="truncate text-sm font-semibold"
        style={{ color: cfg.nameTextColor, fontFamily: getTenantFontStack(cfg.fontFamily) }}
      >
        {cfg.businessName || tenant.name}
      </span>
    );
  }

  if (!compact && cfg?.layout === 'stacked') {
    return (
      <div className="flex items-center gap-3">
        {badge(badgeSize)}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: cfg.nameTextColor }}>
            {cfg.businessName || tenant.name}
          </p>
          {cfg.tagline && (
            <p className="truncate text-[11px]" style={{ color: cfg.taglineTextColor }}>
              {cfg.tagline}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (compact) {
    return badge('h-9 w-9 text-[11px]');
  }
  return badge(badgeSize);
}

interface StorefrontViewProps {
  slug: string;
  lang: Lang;
  /** True when rendered on a delivered customer domain/subdomain. */
  publicHost?: boolean;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
  onBack: () => void;
  onGoDashboards?: () => void;
  onOpenInvoice: (order: OrderRecord, tenantName: string) => void;
  onNotify: (msg: string) => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  slug,
  lang,
  publicHost = false,
  wishlistIds,
  onToggleWishlist,
  onBack,
  onGoDashboards,
  onOpenInvoice,
  onNotify,
}) => {
  const { profile } = useAuth();
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [pwaLicenseValid, setPwaLicenseValid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoSample, setDemoSample] = useState(false);

  // Filters & Modes
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc'>('featured');
  const [wholesaleMode, setWholesaleMode] = useState(false);

  // Gallery & Lightbox
  const [galleryCategory, setGalleryCategory] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Recently Viewed Product IDs (persisted per store)
  const [recentProductIds, setRecentProductIds] = useState<number[]>(() => {
    try {
      const raw = window.localStorage.getItem(`vv_recent_${slug}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'number') : [];
    } catch {
      return [];
    }
  });

  // Cart & Checkout (persisted per store across page refreshes)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponRecord | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [checkoutCity, setCheckoutCity] = useState('');
  const [checkoutState, setCheckoutState] = useState('');
  const [checkoutPincode, setCheckoutPincode] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [checkoutGpsConsent, setCheckoutGpsConsent] = useState(false);
  const [locatingCheckoutGps, setLocatingCheckoutGps] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi_reference' | 'cashfree_online'>('cod');
  const [paymentReference, setPaymentReference] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  // Product Detail Modal & Review Form
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [selectedProductImgIdx, setSelectedProductImgIdx] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Storefront AI Customer Support Chatbot (Real Gemini API)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);

  // Module 15: Storefront Appointment / Consultation Booking Modal
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookName, setBookName] = useState('');
  const [bookPhone, setBookPhone] = useState('');
  const [bookService, setBookService] = useState('Private Consultation / Service Slot');
  const [bookDate, setBookDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [bookSlot, setBookSlot] = useState('11:00 AM');
  const [bookNotes, setBookNotes] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);

  // Stage 3 Modules 2, 4 & 5: Tenant SEO, Custom Pages, Quote Request & Newsletter Consent
  const [seoConfig, setSeoConfig] = useState<{
    canonicalUrl: string;
    robotsDirectives: string;
    googleSiteVerification: string;
    ga4MeasurementId: string;
    cityAreaKeywords: string;
    googleMapsUrl: string;
    gbpProfileUrl: string;
    localBusinessType: string;
    customPagesJson: string;
  } | null>(null);
  const [activeCustomPage, setActiveCustomPage] = useState<{ slug: string; title: string; content: string } | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteReq, setQuoteReq] = useState('');
  const [quoteWhatsappOptIn, setQuoteWhatsappOptIn] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [newsEmail, setNewsEmail] = useState('');
  const [newsName, setNewsName] = useState('');
  const [newsConsent, setNewsConsent] = useState(false);
  const [newsBusy, setNewsBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setCustomerName((prev) => prev || profile.name);
      setCustomerEmail((prev) => prev || profile.email);
      setCustomerPhone((prev) => prev || profile.phone);
      setReviewName((prev) => prev || profile.name);
    }
  }, [profile]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setDemoSample(false);

    // Explicitly labeled, frontend-only sample data for the preview storefronts
    // advertised on the homepage. It is never written to a database and never
    // overrides a real published tenant with the same slug.
    const sampleStorefront = getDemoStorefront(slug);
    let usingDemoFallback = false;

    const tenantRequest = apiFetch<{
      tenant: TenantRecord;
      products: ProductRecord[];
      coupons: CouponRecord[];
      reviews: ReviewRecord[];
    }>(`/api/tenants/${encodeURIComponent(slug)}`).catch((err) => {
      if (sampleStorefront) {
        usingDemoFallback = true;
        return sampleStorefront;
      }
      throw err;
    });

    Promise.all([
      tenantRequest,
      apiFetch<{ valid: boolean }>(`/api/tenants/${encodeURIComponent(slug)}/pwa-license`).catch(() => ({
        valid: false,
      })),
      apiFetch<{ seo: NonNullable<typeof seoConfig> }>(`/api/public/tenants/${encodeURIComponent(slug)}/seo`).catch(
        () => ({ seo: null })
      ),
    ])
      .then(([storeData, pwaData, seoData]) => {
        if (!active) return;
        if (!storeData || !storeData.tenant || typeof storeData.tenant.name !== 'string') {
          throw new Error('This storefront is not published or its data could not be loaded.');
        }
        setDemoSample(usingDemoFallback);
        setTenant(storeData.tenant);
        const liveProducts = Array.isArray(storeData.products) ? storeData.products : [];
        setProducts(liveProducts);
        setCoupons(Array.isArray(storeData.coupons) ? storeData.coupons : []);
        setReviews(Array.isArray(storeData.reviews) ? storeData.reviews : []);

        if (usingDemoFallback) {
          // Never grant a demo catalog live PWA, SEO, checkout or write powers.
          setPwaLicenseValid(false);
          setSeoConfig(null);
          setPaymentMethod('cod');
        } else {
          setPwaLicenseValid(Boolean(pwaData?.valid));
          setSeoConfig(seoData?.seo || null);

          // Select first genuinely configured payment method
          if (storeData.tenant.codEnabled) {
            setPaymentMethod('cod');
          } else if (storeData.tenant.upiId) {
            setPaymentMethod('upi_reference');
          } else if (storeData.tenant.cashfreeOnlineReady) {
            setPaymentMethod('cashfree_online');
          }
        }

        // Hydrate saved cart from localStorage against the loaded catalog
        try {
          const savedRaw = window.localStorage.getItem(`vv_cart_${slug}`);
          const savedItems: Array<{ productId: number; quantity: number; variant: string }> = savedRaw
            ? JSON.parse(savedRaw)
            : [];
          if (Array.isArray(savedItems) && liveProducts.length > 0) {
            const hydrated: CartItem[] = [];
            for (const s of savedItems) {
              const liveProd = liveProducts.find((p) => p.id === s.productId && p.stock > 0);
              if (liveProd) {
                hydrated.push({
                  product: liveProd,
                  quantity: Math.max(1, Math.min(liveProd.stock, Number(s.quantity) || 1)),
                  variant: String(s.variant || 'Standard'),
                });
              }
            }
            setCart(hydrated);
          }
        } catch {}
        setCartHydrated(true);
        setChatMessages([
          {
            role: 'assistant',
            text: usingDemoFallback
              ? `Demo sample catalog for ${storeData.tenant.name}. Ordering and account writes are disabled in this preview.`
              : lang === 'te'
                ? `నమస్కారం! ${storeData.tenant.name} AI సహాయకుడిని. ఉత్పత్తులు, ధరలు లేదా ఆర్డర్ల గురించి అడగండి.`
                : `Welcome to ${storeData.tenant.name}. Ask me about services, products, pricing, or enquiry details.`,
          },
        ]);

        // Dynamically point manifest link to this tenant's licensed manifest when active
        if (!usingDemoFallback && pwaData.valid) {
          let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'manifest';
            document.head.appendChild(link);
          }
          link.href = `/api/tenants/${encodeURIComponent(slug)}/manifest.webmanifest`;
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load storefront.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (link && link.href.includes('/api/tenants/')) {
        link.href = '/manifest.webmanifest';
      }
    };
  }, [slug, lang]);

  // Stage 3 Module 4: Tenant-owned SEO metadata on every storefront route,
  // including /site/{slug} on the unchanged platform host.
  useEffect(() => {
    if (!tenant) return;
    return applyStorefrontMetadata(document, {
      name: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      category: tenant.category,
      description: tenant.description,
      seoTitle: tenant.seoTitle,
      seoDescription: tenant.seoDescription,
      phone: tenant.phone,
      address: tenant.address,
      bannerImage: tenant.bannerImage,
      primaryColor: tenant.primaryColor,
      currency: tenant.currency,
      canonicalUrl: resolveTenantCanonicalUrl({
        origin: publicHost ? window.location.origin : OFFICIAL_SITE_URL,
        pathname: window.location.pathname,
        platformSiteSlug: publicHost ? null : tenant.slug,
        configuredUrl: seoConfig?.canonicalUrl,
      }),
      robotsDirectives: seoConfig?.robotsDirectives,
      googleSiteVerification: seoConfig?.googleSiteVerification,
      googleMapsUrl: seoConfig?.googleMapsUrl,
      localBusinessType: seoConfig?.localBusinessType,
      products,
    });
  }, [tenant, products, seoConfig, publicHost]);

  // Persist cart to localStorage across refreshes
  useEffect(() => {
    if (!cartHydrated) return;
    try {
      const compact = cart.map((c) => ({
        productId: c.product.id,
        quantity: c.quantity,
        variant: c.variant,
      }));
      window.localStorage.setItem(`vv_cart_${slug}`, JSON.stringify(compact));
    } catch {}
  }, [cart, cartHydrated, slug]);

  const modules = useMemo(() => resolveTenantModules(tenant), [tenant]);

  // The builder persists sectionOrder inside website_json. Honour it on the
  // public storefront instead of always rendering the historical fixed order.
  const resolvedSectionOrder = useMemo(() => {
    const knownSections = ['hero', 'catalog', 'gallery', 'booking', 'reviews', 'contact'];
    const saved = Array.isArray(tenant?.sectionOrder)
      ? tenant!.sectionOrder!
          .map((section) => String(section || '').trim().toLowerCase())
          .filter((section) => knownSections.includes(section))
      : [];
    const ordered = saved.length > 0 ? saved : ['hero', 'catalog', 'gallery', 'booking', 'reviews', 'contact'];
    for (const section of knownSections) {
      if (!ordered.includes(section)) ordered.push(section);
    }
    return ordered;
  }, [tenant?.sectionOrder]);

  const sectionStyle = (section: string, offset = 0): React.CSSProperties => {
    const index = resolvedSectionOrder.indexOf(section);
    const position = index >= 0 ? index : resolvedSectionOrder.length;
    return { order: position * 10 + offset };
  };

  const galleryItems: GalleryItem[] = useMemo(() => {
    if (!tenant) return [];
    if (Array.isArray(tenant.galleryItems) && tenant.galleryItems.length > 0) {
      return [...tenant.galleryItems].sort((a, b) => a.order - b.order);
    }
    if (Array.isArray(tenant.galleryImages) && tenant.galleryImages.length > 0) {
      return tenant.galleryImages.map((url, idx) => ({
        id: `gal_${idx + 1}`,
        url,
        title: '',
        description: '',
        category: 'Showcase',
        order: idx,
      }));
    }
    return [];
  }, [tenant]);

  const galleryCategories = useMemo(
    () => ['all', ...Array.from(new Set(galleryItems.map((g) => g.category || 'Showcase')))],
    [galleryItems]
  );

  const visibleGallery = useMemo(
    () =>
      galleryCategory === 'all'
        ? galleryItems
        : galleryItems.filter((g) => (g.category || 'Showcase') === galleryCategory),
    [galleryItems, galleryCategory]
  );

  const openProductDetail = (product: ProductRecord) => {
    setSelectedProduct(product);
    setSelectedProductImgIdx(0);
    try {
      const arr = JSON.parse(product.variantsJson || '[]');
      setSelectedVariant(Array.isArray(arr) && arr[0] ? String(arr[0]) : 'Standard');
    } catch {
      setSelectedVariant('Standard');
    }
    setRecentProductIds((prev) => {
      const next = [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 6);
      try {
        window.localStorage.setItem(`vv_recent_${slug}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const recentProducts = useMemo(
    () =>
      recentProductIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is ProductRecord => Boolean(p))
        .slice(0, 4),
    [recentProductIds, products]
  );

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    return products
      .filter((p) => p.id !== selectedProduct.id && p.category === selectedProduct.category)
      .slice(0, 3);
  }, [products, selectedProduct]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      const catOk = categoryFilter === 'all' || p.category === categoryFilter;
      const featOk = !featuredOnly || Boolean(p.featured || p.bestseller);
      const textOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.subcategory.toLowerCase().includes(q) ||
        (p.specs || '').toLowerCase().includes(q);
      return catOk && featOk && textOk;
    });
    if (sortBy === 'price_asc') return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') return [...list].sort((a, b) => b.price - a.price);
    return [...list].sort((a, b) => Number(Boolean(b.featured || b.bestseller)) - Number(Boolean(a.featured || a.bestseller)));
  }, [products, search, categoryFilter, featuredOnly, sortBy]);

  const getUnitPrice = (p: ProductRecord, qty: number) => {
    if (wholesaleMode && p.wholesalePrice > 0 && qty >= p.minWholesaleQty) {
      return p.wholesalePrice;
    }
    return p.price;
  };

  // Sample catalogs are presentation-only. Every remote write path is blocked
  // before it can reach an API, database, payment provider or messaging service.
  const blockDemoWrite = (): boolean => {
    if (!demoSample) return false;
    onNotify('This is a sample storefront. Ordering and form submissions are disabled in the preview.');
    return true;
  };

  const addToCart = (product: ProductRecord, variant = '') => {
    const qtyToAdd = wholesaleMode ? (product.minWholesaleQty || 1) : 1;
    let defaultVariant = variant;
    if (!defaultVariant) {
      try {
        const parsed = JSON.parse(product.variantsJson || '[]');
        defaultVariant = Array.isArray(parsed) && parsed[0] ? String(parsed[0]) : 'Standard';
      } catch {
        defaultVariant = 'Standard';
      }
    }
    const maxStock = Number.isFinite(product.stock) && product.stock > 0
      ? product.stock
      : (Number((product as any).stockQty) || 9999);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id && c.variant === defaultVariant);
      if (idx >= 0) {
        const next = [...prev];
        const curQty = Number.isFinite(next[idx].quantity) && next[idx].quantity > 0 ? next[idx].quantity : 1;
        next[idx] = { ...next[idx], quantity: Math.min(maxStock, curQty + qtyToAdd) };
        return next;
      }
      return [...prev, { product, quantity: Math.min(maxStock, qtyToAdd), variant: defaultVariant }];
    });
    onNotify(`Added ${product.name} to cart.`);
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target) return prev;
      const curQty = Number.isFinite(target.quantity) && target.quantity > 0 ? target.quantity : 1;
      const newQty = curQty + delta;
      if (newQty <= 0) {
        next.splice(index, 1);
      } else {
        const maxStock = Number.isFinite(target.product.stock) && target.product.stock > 0
          ? target.product.stock
          : (Number((target.product as any).stockQty) || 9999);
        next[index] = { ...target, quantity: Math.min(maxStock, newQty) };
      }
      return next;
    });
  };

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + getUnitPrice(item.product, item.quantity) * item.quantity, 0),
    [cart, wholesaleMode]
  );

  const discount = useMemo(() => {
    if (!appliedCoupon || subtotal < appliedCoupon.minOrder) return 0;
    return appliedCoupon.discountType === 'percent'
      ? Math.round((subtotal * appliedCoupon.discountValue) / 100)
      : Math.min(subtotal, appliedCoupon.discountValue);
  }, [appliedCoupon, subtotal]);

  const hasSandboxTestItem = cart.some(
    (c) => Number(c.product.id) === 999999 || (c.product.name && c.product.name.includes('[SANDBOX TEST]'))
  );
  const deliveryFee = hasSandboxTestItem ? 0 : (tenant?.deliveryFee ?? 0);
  const grandTotal = Math.max(0, subtotal - discount + deliveryFee);

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    const found = coupons.find((c) => c.code.toUpperCase() === code && c.active);
    if (!found) {
      setAppliedCoupon(null);
      onNotify('Invalid or expired coupon code.');
      return;
    }
    if (subtotal < found.minOrder) {
      onNotify(`Minimum order of ₹${found.minOrder.toLocaleString('en-IN')} required for ${found.code}.`);
      return;
    }
    setAppliedCoupon(found);
    onNotify(`Coupon ${found.code} applied!`);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockDemoWrite()) return;
    if (!tenant || cart.length === 0) return;

    const hasConfiguredMethod =
      Boolean(tenant.codEnabled) ||
      Boolean(tenant.upiId) ||
      Boolean(tenant.cashfreeOnlineReady);
    if (!hasConfiguredMethod) {
      onNotify('Online checkout payment methods are not configured for this store yet. Please use WhatsApp Order.');
      return;
    }

    if (paymentMethod === 'upi_reference' && !paymentReference.trim()) {
      onNotify('Please enter your UPI transaction UTR/reference number.');
      return;
    }
    setPlacingOrder(true);
    try {
      const res = await apiFetch<{
        order: OrderRecord;
        paymentSessionId?: string | null;
        cfOrderId?: string | null;
        cashfreeEnvironment?: 'sandbox' | 'production';
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: tenant.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          shippingAddress: shippingAddress.trim(),
          city: checkoutCity.trim(),
          state: checkoutState.trim(),
          pincode: checkoutPincode.trim(),
          deliveryInstructions: deliveryInstructions.trim(),
          couponCode: appliedCoupon?.code || '',
          paymentMethod,
          paymentReference: paymentReference.trim(),
          isWholesale: wholesaleMode,
          items: cart.map((c) => ({
            productId: Number(c.product.id),
            quantity: Number.isFinite(c.quantity) && c.quantity > 0 ? c.quantity : 1,
            variant: c.variant || 'Standard',
          })),
        }),
      });

      if (paymentMethod === 'cashfree_online' && res.paymentSessionId && res.cfOrderId) {
        setPlacingOrder(false);
        await initiateCashfreeStorefrontCheckout({
          paymentSessionId: res.paymentSessionId,
          orderId: res.cfOrderId,
          environment: res.cashfreeEnvironment || 'sandbox',
          onSuccess: async () => {
            // The popup callback is not payment proof. Only the server-side
            // verification result may mark a Cashfree order as paid.
            let verification: {
              verified?: boolean;
              status?: string;
              entityType?: string;
            } | null = null;
            try {
              verification = await apiFetch<{
                verified?: boolean;
                status?: string;
                entityType?: string;
              }>('/api/payments/cashfree/verify', {
                method: 'POST',
                body: JSON.stringify({
                  orderId: res.cfOrderId,
                  storefrontOrderId: res.order?.id,
                }),
              });
            } catch {
              verification = null;
            }

            const isVerified =
              verification?.verified === true &&
              String(verification.status || '').toUpperCase() === 'PAID' &&
              verification.entityType === 'storefront_order';

            if (!isVerified) {
              setConfirmedOrder(res.order);
              onNotify(
                `Payment could not be verified yet. Order #${res.order?.orderNumber || ''} is saved as pending and will be confirmed automatically after gateway settlement.`
              );
              return;
            }

            setConfirmedOrder(
              res.order ? { ...res.order, paymentStatus: 'paid', status: 'confirmed' } : null
            );
            setCart([]);
            setAppliedCoupon(null);
            setPaymentReference('');
            setDeliveryInstructions('');
            try {
              window.localStorage.removeItem(`vv_cart_${slug}`);
            } catch {}
            const refreshed = await apiFetch<{ products: ProductRecord[] }>(`/api/tenants/${encodeURIComponent(slug)}`).catch(() => null);
            if (refreshed?.products) setProducts(refreshed.products);
            onNotify(`Payment verified! Order #${res.order?.orderNumber || ''} confirmed.`);
          },
          onError: (err) => {
            setConfirmedOrder(res.order);
            onNotify(`Payment unsuccessful: ${err.message}. Order #${res.order?.orderNumber || ''} is saved as pending.`);
          },
          onDismiss: () => {
            setConfirmedOrder(res.order);
            onNotify(`Payment popup closed. Order #${res.order?.orderNumber || ''} is recorded as pending payment.`);
          },
        });
        return;
      }

      setConfirmedOrder(res.order);
      setCart([]);
      setAppliedCoupon(null);
      setPaymentReference('');
      setDeliveryInstructions('');
      try {
        window.localStorage.removeItem(`vv_cart_${slug}`);
      } catch {}
      // Refresh live storefront stock counts immediately after checkout
      const refreshed = await apiFetch<{ products: ProductRecord[] }>(`/api/tenants/${encodeURIComponent(slug)}`).catch(() => null);
      if (refreshed?.products) setProducts(refreshed.products);
      onNotify(`Order ${res.order.orderNumber} placed!`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockDemoWrite()) return;
    if (!selectedProduct || !reviewName.trim() || !reviewComment.trim()) return;
    try {
      const res = await apiFetch<{ review: ReviewRecord; averageRating: string; reviewCount: number }>(
        `/api/products/${selectedProduct.id}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            customerName: reviewName.trim(),
            rating: reviewRating,
            comment: reviewComment.trim(),
          }),
        }
      );
      setReviews((prev) => [res.review, ...prev]);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selectedProduct.id
            ? { ...p, rating: res.averageRating, reviewCount: res.reviewCount }
            : p
        )
      );
      setReviewComment('');
      onNotify('Thank you! Your review has been submitted.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to post review.');
    }
  };

  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !chatInput.trim() || chatBusy) return;
    const text = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: 'user', text }]);
    setChatInput('');
    if (demoSample) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'This is a sample storefront preview. Live AI support is disabled; no message was sent.',
        },
      ]);
      return;
    }
    setChatBusy(true);
    try {
      const res = await apiFetch<{ reply: string }>('/api/ai/support-chat', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: tenant.slug, message: text, language: lang }),
      });
      setChatMessages((prev) => [...prev, { role: 'assistant', text: res.reply }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err instanceof Error ? err.message : 'AI support is temporarily unavailable.',
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="h-64 rounded-xl bg-[#111118] animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 rounded-xl bg-[#111118] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-xl w-full rounded-2xl border border-[#2B2B3C] bg-[#0E0E14] p-8 text-center shadow-2xl relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#1E3A8A]/20 rounded-full blur-3xl pointer-events-none" />

          {/* Offline / Maintenance Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#1C180E] border border-[#D4AF37]/30 flex items-center justify-center text-[#ECC86A] mb-5 shadow-inner">
            <Store className="w-8 h-8 stroke-[1.75]" />
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Storefront Offline / Under Maintenance</span>
          </div>

          <h2 className="font-luxury text-2xl font-bold text-white mb-2">
            Website Currently Unavailable
          </h2>

          <p className="text-xs text-[#A0A0B2] leading-relaxed mb-6">
            The storefront for <span className="font-mono text-[#ECC86A] bg-[#161622] px-1.5 py-0.5 rounded border border-[#262638]">/site/{slug}</span> has been unpublished or taken offline by its business owner for scheduled catalog updates, branding adjustments, or private maintenance.
          </p>

          {publicHost ? (
            <p className="text-[11px] text-[#8E8EA2]">
              Please try again later or contact the business directly.
            </p>
          ) : (
            <>
              {/* Business Owner Guidance Box (platform preview only) */}
              <div className="rounded-xl border border-[#232332] bg-[#0A0A0F] p-4 text-left mb-6 space-y-1.5">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#ECC86A]" />
                  <span>Are you the owner of this business?</span>
                </p>
                <p className="text-[11px] text-[#8E8EA2] leading-relaxed">
                  Log in with your verified merchant account to edit website content, upload products, manage live orders, or toggle your site status back to <strong>Published</strong> at any time.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {onGoDashboards && (
                  <button
                    type="button"
                    onClick={onGoDashboards}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity shadow-md"
                  >
                    Go to Business Owner Dashboard
                  </button>
                )}
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-[#2E2E40] text-[#D4D4E8] text-xs font-medium hover:border-[#D4AF37] hover:text-white transition-colors"
                >
                  Back to Marketplace
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: '#08080A' }}>
      {/* Storefront Top Strip & Section Navigation */}
      <div className="border-b border-[#1E1E2A] bg-[#0C0C12] sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="#store-home"
              aria-label={`${tenant.name} home`}
              className="inline-flex min-h-11 min-w-0 items-center gap-2 md:hidden"
            >
              <StorefrontLogo tenant={tenant} variant="compact" />
              <span className="truncate text-xs font-semibold text-white">{tenant.name}</span>
            </a>
            <nav aria-label="Storefront sections" className="hidden md:flex items-center gap-4 text-xs text-[#B8B8C8]">
              <a href="#store-home" className="hover:text-[#ECC86A]">Home</a>
              {(modules.ecommerce || products.length > 0) && (
                <a href="#store-catalog" className="hover:text-[#ECC86A]">
                  {['restaurant', 'cloud-kitchen', 'bakery'].some((k) => tenant.category.toLowerCase().includes(k))
                    ? 'Menu'
                    : 'Catalog'}
                </a>
              )}
              {modules.gallery && galleryItems.length > 0 && (
                <a href="#store-gallery" className="hover:text-[#ECC86A]">Gallery</a>
              )}
              <a href="#store-contact" className="hover:text-[#ECC86A]">Contact & Policies</a>
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2.5">
            {pwaLicenseValid && (
              <PWAInstallButton appLabel={`Install ${tenant.pwaShortName || tenant.name}`} compact />
            )}
            {modules.bookings && (
              <button
                type="button"
                aria-label="Book a slot"
                onClick={() => {
                  setBookName(profile?.name || '');
                  setBookPhone(profile?.phone || '');
                  setBookingOpen(true);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 px-2.5 sm:px-3 rounded-md border border-[#2A2A38] text-xs text-[#E8E8ED] hover:border-[#D4AF37]"
              >
                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">Book Slot</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Open AI support"
              onClick={() => setChatOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 px-2.5 sm:px-3 rounded-md border border-[#2A2A38] text-xs text-[#E8E8ED] hover:border-[#D4AF37]"
            >
              <Bot className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="hidden sm:inline">AI Support</span>
            </button>
            {modules.cartCheckout && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 px-3 sm:px-4 rounded-md text-xs font-semibold text-[#08080A]"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Cart ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile section chips keep navigation visible without a bottom nav. */}
        <nav aria-label="Storefront quick sections" className="border-t border-[#1E1E2A] md:hidden">
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2">
            <a href="#store-home" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-3 text-xs font-semibold text-[#ECC86A]">Home</a>
            {(modules.ecommerce || products.length > 0) && (
              <a href="#store-catalog" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#2A2A38] px-3 text-xs text-[#D4D4E2]">Menu / Catalog</a>
            )}
            {modules.gallery && galleryItems.length > 0 && (
              <a href="#store-gallery" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#2A2A38] px-3 text-xs text-[#D4D4E2]">Gallery</a>
            )}
            {modules.reviews && (
              <a href="#store-reviews" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#2A2A38] px-3 text-xs text-[#D4D4E2]">Reviews</a>
            )}
            <a href="#store-contact" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#2A2A38] px-3 text-xs text-[#D4D4E2]">Contact</a>
          </div>
        </nav>
      </div>

      <div className="flex flex-col">
      {/* Storefront Hero Banner */}
      <section id="store-home" className="scroll-mt-36 border-b border-[#1D1D28] md:scroll-mt-24" style={sectionStyle('hero')}>
        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch sm:px-6">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <StorefrontLogo tenant={tenant} variant="hero" />
              <div className="text-xs text-[#9D9DB0]">
                <span className="capitalize">{tenant.category.replace(/[-_]/g, ' ')}</span>
                {tenant.address && (
                  <>
                    <span className="mx-2">·</span>
                    <span>{tenant.address}</span>
                  </>
                )}
                {tenant.businessHours && (
                  <p className="text-[11px] text-[#B8B8C8] mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#D4AF37]" />
                    <span>{tenant.businessHours}</span>
                  </p>
                )}
              </div>
            </div>
            {demoSample && (
              <span className="mb-3 inline-flex w-fit items-center rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#ECC86A]">
                Demo · sample storefront · no checkout or form submissions
              </span>
            )}
            <h1
              className="text-3xl md:text-4xl font-bold text-white mb-2 text-balance"
              style={{ fontFamily: getTenantFontStack(tenant.fontFamily) }}
            >
              {tenant.heroHeadline && tenant.heroHeadline !== tenant.name
                ? tenant.heroHeadline
                : tenant.name}
            </h1>
            {tenant.tagline && (
              <p className="text-base font-medium mb-3" style={{ color: tenant.primaryColor }}>
                {tenant.tagline}
              </p>
            )}
            {tenant.heroSubheadline &&
              tenant.heroSubheadline !== tenant.tagline &&
              tenant.heroSubheadline !== tenant.description && (
                <p className="text-sm text-[#B4B4C6] leading-relaxed mb-5">
                  {tenant.heroSubheadline}
                </p>
              )}
            {tenant.description && tenant.description !== tenant.tagline && (
              <p className="text-sm text-[#B4B4C6] leading-relaxed mb-5">{tenant.description}</p>
            )}
            {tenant.ctaText && (
              <a
                href="#store-catalog"
                className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-md font-semibold text-[#08080A]"
                style={{ backgroundColor: tenant.primaryColor }}
              >
                {tenant.ctaText}
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
            {Array.isArray(tenant.templateFeatures) && tenant.templateFeatures.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {tenant.templateFeatures.map((feat) => (
                  <span
                    key={feat}
                    className="px-2.5 py-1 rounded-md border border-[#262634] bg-[#101018] text-[11px] text-[#D4D4E2]"
                  >
                    {feat}
                  </span>
                ))}
              </div>
            )}
            {(tenant.phone || tenant.whatsapp) && (
              <div className="flex flex-wrap items-center gap-2.5 mb-5 text-xs">
                {tenant.phone && (
                  <a
                    href={`tel:${tenant.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#2A2A38] bg-[#101018] text-white hover:border-[#D4AF37]"
                  >
                    <Phone className="w-3.5 h-3.5" style={{ color: tenant.primaryColor }} />
                    <span>{tenant.phone}</span>
                  </a>
                )}
                {tenant.whatsapp && (
                  <a
                    href={buildWhatsAppUrl(tenant.whatsapp, tenant.phone, tenant.currency, tenant.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md font-semibold text-[#08080A]"
                    style={{ backgroundColor: tenant.primaryColor }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Order / Enquiry</span>
                  </a>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#9A9AAE]">
              {tenant.deliveryFee > 0 && <span>Delivery Fee: ₹{tenant.deliveryFee}</span>}
              {tenant.codEnabled && <span>Cash on Delivery Available</span>}
              {tenant.upiId && <span>Direct UPI Accepted</span>}
              {coupons[0] && (
                <span className="text-[#ECC86A]">
                  Promo Code: <strong>{coupons[0].code}</strong>
                </span>
              )}
            </div>
            {pwaLicenseValid && !publicHost && (
              <div className="mt-5 inline-flex items-center gap-2 text-xs text-[#C6C6D6]">
                <Smartphone className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>
                  Licensed Branded PWA ({tenant.pwaAppName}) — Installable from browser, not a Play Store app.
                </span>
              </div>
            )}
          </div>
          <div className="lg:col-span-6">
            <div className="h-full min-h-[240px] rounded-xl overflow-hidden border border-[#242432] bg-[#111118]">
              <img
                src={tenant.bannerImage || getCategoryFallbackBanner(tenant.category)}
                alt={tenant.name}
                width={1200}
                height={630}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Controls & Product Grid (shown when ecommerce enabled or products exist) */}
      {(modules.ecommerce || products.length > 0) && (
        <section id="store-catalog" className="max-w-7xl mx-auto scroll-mt-36 px-4 pt-8 pb-4 sm:px-6 md:scroll-mt-24" style={sectionStyle('catalog')}>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    categoryFilter === cat
                      ? 'bg-[#D4AF37] text-[#08080A]'
                      : 'bg-[#12121A] text-[#A3A3B5] border border-[#242432] hover:text-white'
                  }`}
                >
                  {cat === 'all' ? 'All Items' : cat}
                </button>
              ))}
              {products.some((p) => p.featured || p.bestseller) && (
                <button
                  type="button"
                  onClick={() => setFeaturedOnly((v) => !v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                    featuredOnly
                      ? 'border-[#D4AF37] bg-[#1B180E] text-[#ECC86A]'
                      : 'border-[#242432] bg-[#12121A] text-[#A3A3B5]'
                  }`}
                >
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  Featured & Bestsellers
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#78788E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search catalog..."
                  className="pl-8 pr-3 py-1.5 rounded-md border border-[#252534] bg-[#0D0D13] text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-md border border-[#252534] bg-[#0D0D13] px-3 py-1.5 text-xs text-white"
              >
                <option value="featured">Sort: Featured</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
              {(modules.wholesale || products.some((p) => p.wholesalePrice > 0)) && (
                <button
                  type="button"
                  onClick={() => setWholesaleMode((v) => !v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                    wholesaleMode
                      ? 'border-[#D4AF37] bg-[#1B180E] text-[#ECC86A]'
                      : 'border-[#252534] bg-[#0D0D13] text-[#A5A5B8]'
                  }`}
                >
                  {wholesaleMode ? 'Wholesale Mode: ON' : 'Wholesale / Bulk Pricing'}
                </button>
              )}
            </div>
          </div>

          {visibleProducts.length === 0 ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-12 text-center text-sm text-[#9A9AAE]">
              No products or services listed in this category yet.
              {!publicHost && ' Store owners can add items from the Business Owner Dashboard.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleProducts.map((product) => {
                const wished = wishlistIds.includes(product.id);
                const outOfStock = product.stock <= 0;
                const discountPct =
                  !wholesaleMode && product.compareAtPrice > product.price
                    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
                    : 0;
                const waProductUrl =
                  modules.whatsappOrder && tenant.whatsapp
                    ? buildWhatsAppUrl(
                        tenant.whatsapp,
                        tenant.phone,
                        tenant.currency,
                        tenant.name,
                        `Hi ${tenant.name}, I am interested in "${product.name}" (₹${product.price.toLocaleString('en-IN')}). Please share availability.`
                      )
                    : '';

                return (
                  <div
                    key={product.id}
                    className="rounded-xl border border-[#20202D] bg-[#0E0E14] overflow-hidden flex flex-col"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`View ${product.name} details`}
                      className="aspect-[4/3] bg-[#14141D] relative cursor-pointer"
                      onClick={() => openProductDetail(product)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openProductDetail(product);
                        }
                      }}
                    >
                      <img
                        src={product.imageUrl || tenant.bannerImage || getCategoryFallbackBanner(tenant.category)}
                        alt={product.name}
                        width={1200}
                        height={900}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                        {discountPct > 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                            {discountPct}% OFF
                          </span>
                        )}
                        {product.bestseller && (
                          <span className="px-2 py-0.5 rounded bg-[#D4AF37] text-[#08080A] text-[10px] font-bold">
                            Bestseller
                          </span>
                        )}
                        {product.featured && !product.bestseller && (
                          <span className="px-2 py-0.5 rounded bg-[#14141E]/90 border border-[#D4AF37]/50 text-[#ECC86A] text-[10px] font-semibold">
                            Featured
                          </span>
                        )}
                      </div>
                      {modules.wishlist && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleWishlist(product.id);
                          }}
                          className="absolute top-3 right-3 p-2 rounded-md bg-[#08080A]/80 text-white hover:text-[#D4AF37]"
                          aria-label="Toggle wishlist"
                        >
                          <Heart className={`w-4 h-4 ${wished ? 'fill-[#D4AF37] text-[#D4AF37]' : ''}`} />
                        </button>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="text-xs text-[#9090A4] mb-1 flex items-center justify-between">
                        <span>
                          {product.category}{product.subcategory ? ` · ${product.subcategory}` : ''}
                        </span>
                        {modules.reviews && (
                          <span className="inline-flex items-center gap-1 text-[#ECC86A]">
                            <Star className="w-3 h-3 fill-[#D4AF37]" />
                            {product.rating} ({product.reviewCount})
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openProductDetail(product)}
                        className="text-left text-base font-semibold text-white hover:text-[#ECC86A] transition-colors mb-1.5"
                      >
                        {product.name}
                      </button>
                      <p className="text-xs text-[#9B9BAE] line-clamp-2 mb-4 flex-1">{product.description}</p>

                      <div className="flex items-baseline justify-between mb-3">
                        <div>
                          <span className="font-mono-tabular text-lg font-bold text-white">
                            ₹{(wholesaleMode && product.wholesalePrice ? product.wholesalePrice : product.price).toLocaleString('en-IN')}
                          </span>
                          {!wholesaleMode && product.compareAtPrice > product.price && (
                            <span className="ml-2 text-xs font-mono-tabular text-[#77778A] line-through">
                              ₹{product.compareAtPrice.toLocaleString('en-IN')}
                            </span>
                          )}
                          {wholesaleMode && product.wholesalePrice > 0 && (
                            <p className="text-[11px] text-[#ECC86A]">
                              Min. wholesale qty: {product.minWholesaleQty} units
                            </p>
                          )}
                        </div>
                        <span className={`text-xs ${Number.isFinite(product.stock) && product.stock <= (product.lowStockThreshold || 5) ? 'text-amber-400' : 'text-[#8E8EA2]'}`}>
                          {outOfStock ? 'Out of stock' : `${Number.isFinite(product.stock) ? product.stock : 9999} in stock`}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        {modules.cartCheckout && (
                          <>
                            <button
                              type="button"
                              disabled={outOfStock}
                              onClick={() => addToCart(product)}
                              className="flex-1 py-2.5 rounded-md text-xs font-semibold text-[#08080A] disabled:opacity-40 transition-opacity"
                              style={{ backgroundColor: tenant.primaryColor }}
                            >
                              {outOfStock ? 'Out of Stock' : wholesaleMode ? `Bulk (${product.minWholesaleQty})` : 'Add to Cart'}
                            </button>
                            {!outOfStock && (
                              <button
                                type="button"
                                onClick={() => {
                                  addToCart(product);
                                  setCartOpen(true);
                                }}
                                className="px-3 py-2.5 rounded-md border border-[#D4AF37]/50 text-xs font-semibold text-[#ECC86A] hover:bg-[#1A170E]"
                                title="Buy Now"
                              >
                                <Zap className="w-3.5 h-3.5 inline mr-1" />
                                Buy
                              </button>
                            )}
                          </>
                        )}
                        {waProductUrl && (
                          <a
                            href={waProductUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-emerald-500/40 text-xs text-emerald-300 hover:bg-emerald-950/30 ${
                              !modules.cartCheckout ? 'flex-1 font-semibold' : ''
                            }`}
                            aria-label={`Enquire about ${product.name} on WhatsApp`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {!modules.cartCheckout && <span>Enquire on WhatsApp</span>}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recently Viewed Products */}
          {recentProducts.length > 0 && (
            <div className="mt-10 pt-8 border-t border-[#1D1D28]">
              <h2 className="text-sm font-semibold text-white mb-4">Recently Viewed</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {recentProducts.map((rp) => (
                  <button
                    key={rp.id}
                    type="button"
                    onClick={() => openProductDetail(rp)}
                    className="text-left rounded-lg border border-[#20202E] bg-[#0D0D14] p-3 hover:border-[#D4AF37]/50 transition-colors"
                  >
                    <img
                      src={rp.imageUrl || tenant.bannerImage || getCategoryFallbackBanner(tenant.category)}
                      alt={rp.name}
                      width={1200}
                      height={900}
                      loading="lazy"
                      decoding="async"
                      className="w-full aspect-[4/3] rounded object-cover mb-2"
                    />
                    <p className="text-xs font-semibold text-white truncate">{rp.name}</p>
                    <p className="text-xs font-mono-tabular text-[#ECC86A] mt-0.5">₹{rp.price.toLocaleString('en-IN')}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Business Photo & Portfolio Gallery + Lightbox */}
      {modules.gallery && galleryItems.length > 0 && (
        <section id="store-gallery" className="max-w-7xl mx-auto scroll-mt-36 px-4 py-10 border-t border-[#1D1D28] sm:px-6 md:scroll-mt-24" style={sectionStyle('gallery')}>
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-medium text-[#D4AF37] mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Business Gallery & Portfolio</span>
              </p>
              <h2 className="font-luxury text-2xl font-bold text-white">{tenant.name} Showcase</h2>
            </div>
            {galleryCategories.length > 2 && (
              <div className="flex flex-wrap gap-2">
                {galleryCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setGalleryCategory(cat)}
                    className={`px-3 py-1 rounded-md text-xs border ${
                      galleryCategory === cat
                        ? 'border-[#D4AF37] bg-[#D4AF37] text-[#08080A] font-semibold'
                        : 'border-[#252534] bg-[#0E0E15] text-[#A3A3B5]'
                    }`}
                  >
                    {cat === 'all' ? 'All Photos' : cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleGallery.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="group text-left rounded-xl border border-[#222230] bg-[#0D0D14] overflow-hidden hover:border-[#D4AF37]/60 transition-colors"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#14141E]">
                  <img
                    src={item.url}
                    alt={item.title || `${tenant.name} photo ${idx + 1}`}
                    width={1200}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                {(item.title || item.description) && (
                  <div className="p-3">
                    {item.title && <p className="text-xs font-semibold text-white truncate">{item.title}</p>}
                    {item.description && <p className="text-[11px] text-[#9A9AAE] line-clamp-2 mt-0.5">{item.description}</p>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Delivery Info & Return Policy Strip */}
      {(tenant.deliveryInfo || tenant.returnPolicy) && (
        <section className="max-w-7xl mx-auto px-6 pb-8" style={sectionStyle('catalog', 1)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {tenant.deliveryInfo && (
              <div className="rounded-xl border border-[#20202E] bg-[#0D0D14] p-4 flex items-start gap-3">
                <Truck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">Delivery & Fulfillment</p>
                  <p className="text-[#A5A5B8] leading-relaxed">{tenant.deliveryInfo}</p>
                </div>
              </div>
            )}
            {tenant.returnPolicy && (
              <div className="rounded-xl border border-[#20202E] bg-[#0D0D14] p-4 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white mb-1">Return & Cancellation Policy</p>
                  <p className="text-[#A5A5B8] leading-relaxed">{tenant.returnPolicy}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Customer Reviews & Ratings Section (1 to 5 Stars, Verified Purchases, Photos, Google Integration) */}
      {modules.reviews && (
        <div style={sectionStyle('reviews', 2)}>
          <StorefrontReviews
            websiteId={tenant.websiteId || tenant.slug}
            slug={tenant.slug}
            businessName={tenant.name}
            products={products}
            initialReviews={reviews}
            googleReviewUrl={tenant.googleReviewUrl}
            googlePlaceId={tenant.googlePlaceId}
            isDemoStore={demoSample}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* Stage 3 & Stage 5: Published Multi-Branch Map Preview, Direct Contact/Quote Actions & Consent Newsletter */}
      <section id="store-contact" className="max-w-7xl mx-auto scroll-mt-36 px-4 pb-16 space-y-6 sm:px-6 md:scroll-mt-24" style={sectionStyle('contact')}>
        <StorefrontMapPreview
          slug={tenant.slug}
          tenantName={tenant.name}
          fallbackAddress={tenant.address}
          accentColor={tenant.primaryColor}
        />

        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-3">
            <p className="text-xs font-semibold text-[#ECC86A]">Connect with {tenant.name}</p>
            <p className="text-xs text-[#9E9EB2] leading-relaxed">{tenant.address}</p>
            {tenant.businessHours && (
              <p className="text-xs text-[#C8C8D8] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{tenant.businessHours}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {tenant.phone && (
                <a
                  href={`tel:${tenant.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-[#2A2A38] text-white hover:border-[#D4AF37]"
                >
                  <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Call {tenant.phone}</span>
                </a>
              )}
              {tenant.whatsapp && (
                <a
                  href={buildWhatsAppUrl(tenant.whatsapp, tenant.phone, tenant.currency, tenant.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/30"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Enquiry</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setQuoteOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Request Custom Quote</span>
              </button>
              {seoConfig?.googleMapsUrl && (
                <a
                  href={seoConfig.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-[#2A2A38] text-[#B8B8C8] hover:text-white"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Google Maps</span>
                </a>
              )}
            </div>

            {/* Social Media Links */}
            {(tenant.socialLinks?.instagram ||
              tenant.socialLinks?.facebook ||
              tenant.socialLinks?.youtube ||
              tenant.socialLinks?.website) && (
              <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
                {tenant.socialLinks?.instagram && (
                  <a href={tenant.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#262636] text-[#ECC86A] hover:border-[#D4AF37]">
                    <ExternalLink className="w-3 h-3" /> Instagram
                  </a>
                )}
                {tenant.socialLinks?.facebook && (
                  <a href={tenant.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#262636] text-[#ECC86A] hover:border-[#D4AF37]">
                    <ExternalLink className="w-3 h-3" /> Facebook
                  </a>
                )}
                {tenant.socialLinks?.youtube && (
                  <a href={tenant.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#262636] text-[#ECC86A] hover:border-[#D4AF37]">
                    <ExternalLink className="w-3 h-3" /> YouTube
                  </a>
                )}
                {tenant.socialLinks?.website && (
                  <a href={tenant.socialLinks.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#262636] text-[#ECC86A] hover:border-[#D4AF37]">
                    <Globe className="w-3 h-3" /> Website
                  </a>
                )}
              </div>
            )}

            {/* Custom Navigation Pages */}
            {(() => {
              let pages: Array<{ slug: string; title: string; content: string }> = [];
              try {
                const parsed = JSON.parse(seoConfig?.customPagesJson || '[]');
                if (Array.isArray(parsed)) pages = parsed;
              } catch {}
              if (pages.length === 0) return null;
              return (
                <div className="pt-3 border-t border-[#1D1D28] space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {pages.map((pg) => (
                      <button
                        key={pg.slug}
                        type="button"
                        onClick={() => setActiveCustomPage(activeCustomPage?.slug === pg.slug ? null : pg)}
                        className={`px-2.5 py-1 rounded text-[11px] border ${
                          activeCustomPage?.slug === pg.slug
                            ? 'border-[#D4AF37] bg-[#1C180E] text-[#ECC86A]'
                            : 'border-[#262634] text-[#A5A5B8] hover:text-white'
                        }`}
                      >
                        {pg.title}
                      </button>
                    ))}
                  </div>
                  {activeCustomPage && (
                    <div className="rounded border border-[#1E1E2B] bg-[#09090D] p-3 text-xs">
                      <p className="font-semibold text-white mb-1">{activeCustomPage.title}</p>
                      <p className="text-[#A5A5B8] leading-relaxed">{activeCustomPage.content}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Consent-Based Newsletter Subscription */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (blockDemoWrite()) return;
              if (!newsConsent) {
                onNotify('Please check the explicit consent box before subscribing.');
                return;
              }
              setNewsBusy(true);
              try {
                await apiFetch('/api/newsletter/subscribe', {
                  method: 'POST',
                  body: JSON.stringify({
                    tenantId: tenant.id,
                    email: newsEmail.trim(),
                    name: newsName.trim(),
                    source: `storefront:${tenant.slug}`,
                    consentGiven: true,
                  }),
                });
                setNewsEmail('');
                setNewsName('');
                setNewsConsent(false);
                onNotify(`Subscribed to ${tenant.name} updates!`);
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Subscription failed.');
              } finally {
                setNewsBusy(false);
              }
            }}
            className="lg:col-span-7 rounded-lg border border-[#1F1F2D] bg-[#09090D] p-5 space-y-3 text-xs"
          >
            <p className="font-semibold text-white">Join {tenant.name} Updates & Seasonal Offers</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={newsName}
                onChange={(e) => setNewsName(e.target.value)}
                placeholder="Your Name"
                className="rounded border border-[#2A2A38] bg-[#0E0E15] px-3 py-2 text-white"
              />
              <input
                type="email"
                required
                value={newsEmail}
                onChange={(e) => setNewsEmail(e.target.value)}
                placeholder="Your Email Address"
                className="rounded border border-[#2A2A38] bg-[#0E0E15] px-3 py-2 text-white"
              />
            </div>
            <label className="flex items-start gap-2 text-[11px] text-[#9A9AAE] cursor-pointer">
              <input
                type="checkbox"
                checked={newsConsent}
                onChange={(e) => setNewsConsent(e.target.checked)}
                className="accent-[#D4AF37] mt-0.5"
              />
              <span>
                I explicitly consent to receive product launches and offer updates from {tenant.name}. I can unsubscribe anytime.
              </span>
            </label>
            <button
              type="submit"
              disabled={newsBusy}
              className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
            >
              {newsBusy ? 'Subscribing...' : 'Subscribe with Consent'}
            </button>
          </form>
        </div>
      </section>
      </div>

      {/* Quote Request Modal */}
      {quoteOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#2A2A38] bg-[#0D0D13] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-luxury text-lg font-bold text-white">Request Quote · {tenant.name}</h3>
              <button type="button" onClick={() => setQuoteOpen(false)} aria-label="Close quote request" className="inline-flex h-11 w-11 items-center justify-center text-[#8E8EA2] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (blockDemoWrite()) return;
                const phoneCheck = validateIndiaWhatsAppNumber(quotePhone.trim());
                if (!phoneCheck.ok) {
                  onNotify(phoneCheck.error || 'Enter a valid Indian WhatsApp number.');
                  return;
                }
                setQuoteBusy(true);
                try {
                  const result = await apiFetch<{
                    ok?: boolean;
                    message?: string;
                    whatsapp?: { status?: string; notice?: string };
                  }>(`/api/public/tenants/${encodeURIComponent(tenant.slug)}/quote-request`, {
                    method: 'POST',
                    body: JSON.stringify({
                      name: quoteName.trim(),
                      phone: phoneCheck.value!.e164,
                      email: quoteEmail.trim(),
                      requirement: quoteReq.trim(),
                      whatsappOptIn: quoteWhatsappOptIn,
                    }),
                  });
                  setQuoteOpen(false);
                  setQuoteName('');
                  setQuotePhone('');
                  setQuoteEmail('');
                  setQuoteReq('');
                  setQuoteWhatsappOptIn(false);
                  const waStatus = result?.whatsapp?.status;
                  onNotify(
                    waStatus && waStatus !== 'sent'
                      ? `Quote request saved. WhatsApp: ${waStatus.replace(/_/g, ' ')}.`
                      : `Quote request sent directly to ${tenant.name} CRM!`
                  );
                } catch (err) {
                  onNotify(err instanceof Error ? err.message : 'Unable to send quote request.');
                } finally {
                  setQuoteBusy(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <input type="text" required value={quoteName} onChange={(e) => setQuoteName(e.target.value)} placeholder="Your Name" className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white" />
              <input type="tel" required value={quotePhone} onChange={(e) => setQuotePhone(e.target.value)} placeholder="WhatsApp Number (+91 98765 43210)" className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white" />
              <input type="email" value={quoteEmail} onChange={(e) => setQuoteEmail(e.target.value)} placeholder="Email (optional)" className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white" />
              <textarea rows={3} required value={quoteReq} onChange={(e) => setQuoteReq(e.target.value)} placeholder="Describe items, bulk quantity, delivery city, or custom requirements..." className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white" />
              <label className="flex items-start gap-2 text-[11px] text-[#9A9AAE] cursor-pointer">
                <input
                  type="checkbox"
                  checked={quoteWhatsappOptIn}
                  onChange={(e) => setQuoteWhatsappOptIn(e.target.checked)}
                  className="accent-[#D4AF37] mt-0.5"
                />
                <span>I explicitly agree to receive a WhatsApp reply about this enquiry from {tenant.name}.</span>
              </label>
              <button type="submit" disabled={quoteBusy} className="w-full py-2.5 rounded bg-gold-gradient text-[#08080A] font-semibold">
                {quoteBusy ? 'Sending Quote Request...' : 'Submit Quote Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Product Detail & Reviews Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl border border-[#282838] bg-[#0F0F16] p-6 text-[#E8E8ED] my-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-[#9A9AAE]">
                  {selectedProduct.category} · {selectedProduct.subcategory}
                </p>
                <h3 className="font-luxury text-xl font-bold text-white">{selectedProduct.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedProduct(null)} className="p-1 text-[#8B8B9C] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-2.5">
                {(() => {
                  const galleryList =
                    selectedProduct.images && selectedProduct.images.length > 0
                      ? selectedProduct.images
                      : [selectedProduct.imageUrl || tenant.bannerImage || getCategoryFallbackBanner(tenant.category)];
                  const activeUrl = galleryList[selectedProductImgIdx] || galleryList[0];
                  return (
                    <>
                      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-[#14141E]">
                        <img
                          src={activeUrl}
                          alt={selectedProduct.name}
                          width={1200}
                          height={900}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {galleryList.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {galleryList.map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedProductImgIdx(i)}
                              className={`w-14 h-14 rounded overflow-hidden border shrink-0 ${
                                selectedProductImgIdx === i ? 'border-[#D4AF37]' : 'border-[#252534]'
                              }`}
                            >
                              <img src={img} alt={`${selectedProduct.name} view ${i + 1}`} width={56} height={56} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="space-y-4">
                <p className="text-sm text-[#B8B8C8] leading-relaxed">{selectedProduct.description}</p>
                {selectedProduct.specs && (
                  <div className="rounded-lg border border-[#222230] bg-[#0B0B10] p-3 text-xs">
                    <p className="text-[11px] font-semibold text-[#ECC86A] mb-1">Specifications & Details</p>
                    <p className="text-[#C8C8D8]">{selectedProduct.specs}</p>
                  </div>
                )}
                {selectedProduct.videoUrl && (
                  <a
                    href={selectedProduct.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-[#ECC86A] hover:underline"
                  >
                    Watch Product Video Showcase →
                  </a>
                )}
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono-tabular text-2xl font-bold text-[#ECC86A]">
                    ₹{selectedProduct.price.toLocaleString('en-IN')}
                  </span>
                  {selectedProduct.compareAtPrice > selectedProduct.price && (
                    <span className="text-sm font-mono-tabular text-[#7E7E92] line-through">
                      ₹{selectedProduct.compareAtPrice.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                {selectedProduct.wholesalePrice > 0 && (
                  <p className="text-xs text-[#A5A5B8]">
                    Wholesale Rate: ₹{selectedProduct.wholesalePrice.toLocaleString('en-IN')} (min {selectedProduct.minWholesaleQty} units)
                  </p>
                )}

                <div>
                  <p className="text-xs text-[#9D9DB0] mb-2">Select Variant / Size / Color</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      let vars: string[] = ['Standard'];
                      try {
                        const parsed = JSON.parse(selectedProduct.variantsJson || '[]');
                        if (Array.isArray(parsed) && parsed.length > 0) vars = parsed;
                      } catch {}
                      return vars.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSelectedVariant(v)}
                          className={`px-3 py-1.5 rounded-md text-xs border ${
                            selectedVariant === v
                              ? 'border-[#D4AF37] bg-[#1C180E] text-[#ECC86A]'
                              : 'border-[#272736] text-[#B4B4C4]'
                          }`}
                        >
                          {v}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {modules.cartCheckout && (
                    <button
                      type="button"
                      disabled={selectedProduct.stock <= 0}
                      onClick={() => {
                        addToCart(selectedProduct, selectedVariant);
                        setSelectedProduct(null);
                        setCartOpen(true);
                      }}
                      className="flex-1 py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold disabled:opacity-40"
                    >
                      {selectedProduct.stock <= 0 ? 'Out of Stock' : 'Add to Cart & Checkout'}
                    </button>
                  )}
                  {modules.whatsappOrder && tenant.whatsapp && (
                    <a
                      href={buildWhatsAppUrl(
                        tenant.whatsapp,
                        tenant.phone,
                        tenant.currency,
                        tenant.name,
                        `Hi ${tenant.name}, I would like to order "${selectedProduct.name}" (${selectedVariant || 'Standard'}) priced at ₹${selectedProduct.price.toLocaleString('en-IN')}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-md border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-950/30"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp Enquiry</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {relatedProducts.length > 0 && (
              <div className="border-t border-[#222230] pt-4 pb-5">
                <h4 className="text-xs font-semibold text-[#ECC86A] mb-3">Related Products</h4>
                <div className="grid grid-cols-3 gap-3">
                  {relatedProducts.map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => openProductDetail(rel)}
                      className="text-left rounded-lg border border-[#222230] bg-[#0B0B10] p-2 hover:border-[#D4AF37]/50"
                    >
                      <img
                        src={rel.imageUrl || tenant.bannerImage || getCategoryFallbackBanner(tenant.category)}
                        alt={rel.name}
                        width={1200}
                        height={900}
                        loading="lazy"
                        decoding="async"
                        className="w-full aspect-[4/3] rounded object-cover mb-1.5"
                      />
                      <p className="text-[11px] font-semibold text-white truncate">{rel.name}</p>
                      <p className="text-[11px] font-mono-tabular text-[#ECC86A]">₹{rel.price.toLocaleString('en-IN')}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Reviews */}
            <div className="border-t border-[#222230] pt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-white mb-3">Customer Reviews</h4>
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {reviews.filter((r) => r.productId === selectedProduct.id).length === 0 ? (
                    <p className="text-xs text-[#8A8A9E]">Be the first to review this product.</p>
                  ) : (
                    reviews
                      .filter((r) => r.productId === selectedProduct.id)
                      .map((r) => (
                        <div key={r.id} className="rounded-lg border border-[#20202C] bg-[#0B0B10] p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="text-white">{r.customerName}</strong>
                              {r.verifiedPurchase && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  Verified
                                </span>
                              )}
                            </div>
                            <span className="text-[#ECC86A] font-semibold">{r.rating} / 5 ★</span>
                          </div>
                          {r.title && <p className="font-semibold text-white text-[11px]">{r.title}</p>}
                          <p className="text-[#A8A8BA]">{r.comment}</p>
                          {r.ownerReply && (
                            <div className="mt-1.5 pl-2 border-l-2 border-[#D4AF37] text-[11px] text-[#ECC86A] bg-[#14120A] p-1.5 rounded-r">
                              <p className="font-semibold">Owner response:</p>
                              <p className="text-[#DFD7BE]">{r.ownerReply}</p>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmitReview} className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Write a Review</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={reviewName}
                    onChange={(e) => setReviewName(e.target.value)}
                    placeholder="Your name"
                    className="rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-xs text-white"
                  />
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    className="rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-xs text-white"
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} Stars
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={2}
                  required
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share product quality and delivery experience..."
                  className="w-full rounded-md border border-[#292938] bg-[#09090D] px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-semibold hover:bg-[#19170E]"
                >
                  Submit Review
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Cart & Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75">
          <div className="w-full max-w-md bg-[#0E0E14] border-l border-[#242434] h-full flex flex-col">
            <div className="px-6 py-4 border-b border-[#20202D] flex items-center justify-between">
              <h3 className="font-luxury text-base font-semibold text-white">Shopping Cart & Checkout</h3>
              <button type="button" onClick={() => setCartOpen(false)} className="p-1 text-[#8B8B9C] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {confirmedOrder ? (
                confirmedOrder.paymentStatus === 'paid' || confirmedOrder.status === 'confirmed' || confirmedOrder.paymentMethod === 'cod' || confirmedOrder.paymentMethod === 'pay_on_delivery' ? (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-5 space-y-3 text-xs">
                    <p className="text-sm font-semibold text-emerald-300">Order Confirmed</p>
                    <p className="text-[#D4D4E0]">
                      Tracking ID: <strong className="font-mono-tabular text-white">{confirmedOrder.orderNumber}</strong>
                    </p>
                    <p className="text-[#D4D4E0]">
                      Total Paid: <strong className="font-mono-tabular text-[#ECC86A]">₹{confirmedOrder.total.toLocaleString('en-IN')}</strong>
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(confirmedOrder, tenant.name)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>GST Invoice</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmedOrder(null);
                          setCartOpen(false);
                        }}
                        className="px-3.5 py-2 rounded-md border border-[#2C2C3C] text-white"
                      >
                        Continue Shopping
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-5 space-y-3 text-xs">
                    <p className="text-sm font-semibold text-amber-300">Payment Incomplete — Order Saved as Pending</p>
                    <p className="text-[#D4D4E0]">
                      Tracking ID: <strong className="font-mono-tabular text-white">{confirmedOrder.orderNumber}</strong>
                    </p>
                    <p className="text-[#D4D4E0]">
                      Total Due: <strong className="font-mono-tabular text-[#ECC86A]">₹{confirmedOrder.total.toLocaleString('en-IN')}</strong>
                    </p>
                    <p className="text-xs text-amber-200/80">
                      Payment was not completed. Your order has been securely saved as pending payment. Contact support with this tracking ID for payment assistance; no payment has been recorded as successful.
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmedOrder(null);
                          setCartOpen(false);
                        }}
                        className="px-3.5 py-2 rounded-md border border-[#2C2C3C] text-white"
                      >
                        Continue Shopping
                      </button>
                    </div>
                  </div>
                )
              ) : cart.length === 0 ? (
                <p className="text-sm text-[#8E8EA2] text-center py-12">Your shopping cart is empty.</p>
              ) : (
                <>
                  {hasSandboxTestItem && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 flex items-center gap-2 text-xs text-amber-200">
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="font-semibold text-amber-300">Sandbox Test Mode Active: ₹1 Safe Simulation</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {cart.map((item, idx) => (
                      <div
                        key={`${item.product.id}-${item.variant}`}
                        className="rounded-lg border border-[#222230] bg-[#0A0A0F] p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{item.product.name}</p>
                          <p className="text-[11px] text-[#8E8EA2]">
                            {item.variant} · ₹{getUnitPrice(item.product, item.quantity).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(idx, -1)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded border border-[#2A2A38] text-[#B8B8C8]"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono-tabular text-xs w-6 text-center">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(idx, 1)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded border border-[#2A2A38] text-[#B8B8C8]"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Coupon Box */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-3.5 h-3.5 text-[#7C7C92] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder={coupons[0] ? `Try ${coupons[0].code}` : 'Coupon code'}
                        className="w-full pl-8 pr-3 py-2 rounded-md border border-[#2A2A38] bg-[#09090D] text-xs text-white uppercase"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="px-3.5 py-2 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-semibold"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Totals */}
                  <div className="rounded-lg border border-[#222230] bg-[#0A0A0F] p-4 space-y-1.5 text-xs">
                    <div className="flex justify-between text-[#A3A3B5]">
                      <span>Subtotal</span>
                      <span className="font-mono-tabular">₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Coupon ({appliedCoupon?.code})</span>
                        <span className="font-mono-tabular">-₹{discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#A3A3B5]">
                      <span>Delivery Fee</span>
                      <span className="font-mono-tabular">₹{deliveryFee.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-white pt-2 border-t border-[#1F1F2C]">
                      <span>Total</span>
                      <span className="font-mono-tabular text-[#ECC86A]">₹{grandTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Sandbox Testing Information Helper */}
                  {hasSandboxTestItem && (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3 space-y-2 text-[11px] text-amber-200">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Cashfree Sandbox Test Mode (Safe ₹1 Simulation)</span>
                      </div>
                      <p className="text-[10px] text-amber-200/80 leading-relaxed">
                        This is a safe sandbox test checkout. Zero real money will be charged. Use these official Cashfree simulator credentials:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5 text-[10px] font-mono-tabular">
                        <div className="rounded bg-black/50 p-2 border border-[#2D2A1C]">
                          <span className="text-[#8E8EA2] block text-[9px] uppercase font-sans font-semibold">Test Card (Visa/Mastercard)</span>
                          <span className="text-white font-bold block select-all">4012 0010 3714 1112</span>
                          <span className="text-[#A5A5B8] block text-[9px]">Exp: 12/28 · CVV: 123 · OTP: 123456</span>
                        </div>
                        <div className="rounded bg-black/50 p-2 border border-[#2D2A1C]">
                          <span className="text-[#8E8EA2] block text-[9px] uppercase font-sans font-semibold">Test UPI / NetBanking</span>
                          <span className="text-white font-bold block select-all">success@upi</span>
                          <span className="text-[#A5A5B8] block text-[9px]">Select Test Bank or click Approve</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Checkout Form */}
                  <form onSubmit={handleCheckout} className="space-y-3">
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Mobile Number"
                        className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-white"
                      />
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="Email (optional)"
                        className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-white"
                      />
                    </div>
                    {profile && (() => {
                      let saved: string[] = [];
                      try {
                        const arr = JSON.parse(profile.savedAddressesJson || '[]');
                        if (Array.isArray(arr)) saved = arr;
                      } catch {}
                      if (saved.length === 0) return null;
                      return (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) setShippingAddress(e.target.value);
                          }}
                          className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-[#ECC86A]"
                        >
                          <option value="">Use a saved delivery address...</option>
                          {saved.map((addr, idx) => (
                            <option key={idx} value={addr}>
                              {addr}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                    <div className="rounded-md border border-[#232332] bg-[#0B0B11] p-2.5 space-y-2">
                      <label className="flex items-start gap-2 text-[11px] text-[#9E9EB2] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checkoutGpsConsent}
                          onChange={(e) => setCheckoutGpsConsent(e.target.checked)}
                          className="accent-[#D4AF37] mt-0.5"
                        />
                        <span>
                          Optional: I consent to read my current mobile GPS location once to auto-fill my delivery address.
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={!checkoutGpsConsent || locatingCheckoutGps}
                        onClick={async () => {
                          setLocatingCheckoutGps(true);
                          try {
                            const pos = await requestSingleGpsPosition(false);
                            try {
                              const geo = await reverseGeocodeViaProxy(pos.latitude, pos.longitude);
                              setShippingAddress(geo.formattedAddress);
                              onNotify('Delivery address filled from GPS. Please verify flat/door number before ordering.');
                            } catch {
                              setShippingAddress(
                                `GPS Coordinates (${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}) — please add house/street details`
                              );
                              onNotify('GPS coordinates captured. Please add your street/door number manually.');
                            }
                          } catch (err) {
                            onNotify(err instanceof Error ? err.message : 'Unable to read GPS. Enter your address manually below.');
                          } finally {
                            setLocatingCheckoutGps(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] text-[11px] font-medium disabled:opacity-40"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>{locatingCheckoutGps ? 'Detecting Location...' : 'Fill Address via Mobile GPS'}</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="House / Flat No., Street, Landmark"
                      className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-white"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        required
                        value={checkoutCity}
                        onChange={(e) => setCheckoutCity(e.target.value)}
                        placeholder="City"
                        className="rounded-md border border-[#2A2A38] bg-[#09090D] px-2.5 py-2 text-xs text-white"
                      />
                      <input
                        type="text"
                        value={checkoutState}
                        onChange={(e) => setCheckoutState(e.target.value)}
                        placeholder="State"
                        className="rounded-md border border-[#2A2A38] bg-[#09090D] px-2.5 py-2 text-xs text-white"
                      />
                      <input
                        type="text"
                        required
                        value={checkoutPincode}
                        onChange={(e) => setCheckoutPincode(e.target.value)}
                        placeholder="Pincode"
                        className="rounded-md border border-[#2A2A38] bg-[#09090D] px-2.5 py-2 text-xs font-mono-tabular text-white"
                      />
                    </div>
                    <input
                      type="text"
                      value={deliveryInstructions}
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      placeholder="Delivery instructions (e.g. Call on arrival, leave at security)"
                      className="w-full rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-xs text-white"
                    />

                    {/* Honest Configured-Only Payment Methods with Complete Cashfree PG Suite */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white">Select Payment Method</p>
                        <span className="text-[10px] text-[#8E8EA2] flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-400" />
                          <span>256-Bit SSL Encrypted</span>
                        </span>
                      </div>
                      {(() => {
                        const availableMethods: Array<{
                          id: 'cod' | 'upi_reference' | 'cashfree_online';
                          label: string;
                          badge: string;
                        }> = [];

                        if (tenant.cashfreeOnlineReady || tenant.razorpayOnlineReady) {
                          availableMethods.push({
                            id: 'cashfree_online',
                            label: 'Online Payment (Cashfree PG)',
                            badge: 'Instant · UPI, QR, Cards, NetBanking',
                          });
                        }
                        if (tenant.codEnabled) {
                          availableMethods.push({
                            id: 'cod',
                            label: 'Cash on Delivery (COD)',
                            badge: 'Pay cash at doorstep',
                          });
                        }
                        if (tenant.upiId) {
                          availableMethods.push({
                            id: 'upi_reference',
                            label: 'Direct UPI Transfer',
                            badge: 'Merchant UPI ID transfer',
                          });
                        }

                        if (availableMethods.length === 0) {
                          return (
                            <div className="rounded-md border border-amber-500/35 bg-amber-950/20 p-3 text-[11px] text-amber-200">
                              Online payment methods (COD / UPI / Cashfree PG) are not enabled by this business yet. Please place your order via WhatsApp below.
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-1 gap-2">
                              {availableMethods.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setPaymentMethod(m.id)}
                                  className={`p-3 rounded-lg text-left transition-all border ${
                                    paymentMethod === m.id
                                      ? 'border-[#D4AF37] bg-[#16140E] text-white shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                                      : 'border-[#222230] bg-[#0A0A0F] text-[#A5A5B8] hover:border-[#333346]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                          paymentMethod === m.id
                                            ? 'border-[#D4AF37] bg-[#D4AF37]'
                                            : 'border-[#444458] bg-transparent'
                                        }`}
                                      >
                                        {paymentMethod === m.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                                      </div>
                                      <span className="text-xs font-semibold text-white">{m.label}</span>
                                    </div>
                                    <span className="text-[10px] text-[#ECC86A] font-mono-tabular">{m.badge}</span>
                                  </div>

                                  {/* Cashfree PG Method Badges */}
                                  {m.id === 'cashfree_online' && paymentMethod === 'cashfree_online' && (
                                    <div className="mt-3 pt-3 border-t border-[#26241B] space-y-2.5 text-[11px]">
                                      <p className="text-[#B9B9CC] text-[10px]">
                                        Choose any payment option inside Cashfree secure checkout:
                                      </p>
                                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="rounded border border-[#2D2A1C] bg-[#0E0D08] p-2 flex items-start gap-2">
                                          <Smartphone className="w-3.5 h-3.5 text-[#ECC86A] shrink-0 mt-0.5" />
                                          <div>
                                            <p className="font-semibold text-white">UPI Apps</p>
                                            <p className="text-[#8E8EA2] text-[9px] mt-0.5">Google Pay, PhonePe, Paytm, BHIM, Cred</p>
                                          </div>
                                        </div>
                                        <div className="rounded border border-[#2D2A1C] bg-[#0E0D08] p-2 flex items-start gap-2">
                                          <QrCode className="w-3.5 h-3.5 text-[#ECC86A] shrink-0 mt-0.5" />
                                          <div>
                                            <p className="font-semibold text-white">Dynamic UPI QR</p>
                                            <p className="text-[#8E8EA2] text-[9px] mt-0.5">Scan &amp; Pay with any UPI app</p>
                                          </div>
                                        </div>
                                        <div className="rounded border border-[#2D2A1C] bg-[#0E0D08] p-2 flex items-start gap-2">
                                          <CreditCard className="w-3.5 h-3.5 text-[#ECC86A] shrink-0 mt-0.5" />
                                          <div>
                                            <p className="font-semibold text-white">Cards</p>
                                            <p className="text-[#8E8EA2] text-[9px] mt-0.5">RuPay, Visa, Mastercard, Maestro</p>
                                          </div>
                                        </div>
                                        <div className="rounded border border-[#2D2A1C] bg-[#0E0D08] p-2 flex items-start gap-2">
                                          <Building2 className="w-3.5 h-3.5 text-[#ECC86A] shrink-0 mt-0.5" />
                                          <div>
                                            <p className="font-semibold text-white">Net Banking</p>
                                            <p className="text-[#8E8EA2] text-[9px] mt-0.5">50+ Banks (SBI, HDFC, ICICI, Axis)</p>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 pt-0.5">
                                        <ShieldCheck className="w-3 h-3 shrink-0" />
                                        <span>RBI Authorized Payment Aggregator · Verified Server-Side by the Payment Gateway</span>
                                      </div>
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>

                            {paymentMethod === 'upi_reference' && tenant.upiId && (
                              <div className="rounded-md border border-[#272736] bg-[#09090D] p-3 space-y-2 text-[11px]">
                                <p className="text-[#C8C8D8]">
                                  Pay directly to Merchant UPI ID:{' '}
                                  <strong className="font-mono-tabular text-[#ECC86A]">{tenant.upiId}</strong>
                                </p>
                                <input
                                  type="text"
                                  required
                                  value={paymentReference}
                                  onChange={(e) => setPaymentReference(e.target.value)}
                                  placeholder="Enter 12-digit UPI UTR / Reference ID"
                                  className="w-full rounded border border-[#2D2D3D] bg-[#0E0E14] px-2.5 py-1.5 text-xs text-white"
                                />
                                <p className="text-[10px] text-[#8E8EA2]">
                                  Payment status stays Pending until verified by the store owner.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {(tenant.codEnabled || tenant.upiId || tenant.cashfreeOnlineReady || tenant.razorpayOnlineReady) && (
                      <button
                        type="submit"
                        disabled={placingOrder}
                        className="w-full py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold disabled:opacity-60 flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition-opacity"
                      >
                        {placingOrder ? (
                          'Initiating Secure Payment...'
                        ) : paymentMethod === 'cashfree_online' ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Pay ₹{grandTotal.toLocaleString('en-IN')} via Cashfree (UPI / QR / Cards / NetBanking)</span>
                          </>
                        ) : paymentMethod === 'cod' ? (
                          <>
                            <Truck className="w-3.5 h-3.5" />
                            <span>Confirm Order (Cash on Delivery) · ₹{grandTotal.toLocaleString('en-IN')}</span>
                          </>
                        ) : (
                          <span>Submit Order with UPI Reference · ₹{grandTotal.toLocaleString('en-IN')}</span>
                        )}
                      </button>
                    )}

                    {/* WhatsApp Cart Order Share */}
                    {modules.whatsappOrder && tenant.whatsapp && (
                      <a
                        href={buildWhatsAppUrl(
                          tenant.whatsapp,
                          tenant.phone,
                          tenant.currency,
                          tenant.name,
                          `New Order for ${tenant.name}:\n` +
                            cart
                              .map(
                                (c) =>
                                  `• ${c.product.name} (${c.variant}) x${c.quantity} = ₹${(
                                    getUnitPrice(c.product, c.quantity) * c.quantity
                                  ).toLocaleString('en-IN')}`
                              )
                              .join('\n') +
                            `\nSubtotal: ₹${subtotal.toLocaleString('en-IN')}` +
                            (discount > 0 ? `\nDiscount: -₹${discount.toLocaleString('en-IN')}` : '') +
                            `\nDelivery: ₹${deliveryFee.toLocaleString('en-IN')}` +
                            `\nTotal: ₹${grandTotal.toLocaleString('en-IN')}` +
                            (customerName ? `\nName: ${customerName}` : '') +
                            (shippingAddress ? `\nAddress: ${shippingAddress} ${checkoutCity} ${checkoutPincode}` : '')
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-950/30"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Send Order via WhatsApp</span>
                      </a>
                    )}
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Gallery Lightbox Modal */}
      {lightboxIndex !== null && visibleGallery[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute -top-2 right-0 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close gallery lightbox"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="relative w-full flex items-center justify-center">
              {visibleGallery.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((prev) =>
                      prev === null ? 0 : (prev - 1 + visibleGallery.length) % visibleGallery.length
                    )
                  }
                  className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 mr-3"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <img
                src={visibleGallery[lightboxIndex].url}
                alt={visibleGallery[lightboxIndex].title || tenant.name}
                width={1200}
                height={900}
                loading="lazy"
                decoding="async"
                className="max-h-[75vh] max-w-full rounded-xl object-contain border border-white/15"
              />
              {visibleGallery.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightboxIndex((prev) =>
                      prev === null ? 0 : (prev + 1) % visibleGallery.length
                    )
                  }
                  className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 ml-3"
                  aria-label="Next photo"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="text-center max-w-xl">
              {visibleGallery[lightboxIndex].title && (
                <p className="text-sm font-semibold text-white">{visibleGallery[lightboxIndex].title}</p>
              )}
              {visibleGallery[lightboxIndex].description && (
                <p className="text-xs text-[#B8B8C8] mt-1">{visibleGallery[lightboxIndex].description}</p>
              )}
              <p className="text-[11px] text-[#8E8EA2] mt-1">
                {lightboxIndex + 1} / {visibleGallery.length} · {visibleGallery[lightboxIndex].category || 'Showcase'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Storefront AI Customer Support Chatbot (Real Gemini 4 Hydrogen) */}
      {chatOpen && (
        <div
          className="fixed z-50 w-[min(340px,calc(100vw-2rem))] sm:w-[380px] rounded-xl border border-[#2A2A3A] bg-[#0E0E15] shadow-2xl flex flex-col overflow-hidden"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))', right: 'calc(1rem + env(safe-area-inset-right, 0px))' }}
        >
          <div className="px-4 py-3 border-b border-[#20202D] flex items-center justify-between bg-[#12121B]">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
              <span>{tenant.name} AI Support</span>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} aria-label="Close AI support" className="inline-flex h-11 w-11 items-center justify-center text-[#8E8EA2] hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 h-72 overflow-y-auto space-y-3 text-xs">
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#1D1A10] border border-[#D4AF37]/30 text-[#F4E3B4] ml-8'
                    : 'bg-[#14141E] border border-[#232332] text-[#D8D8E4] mr-6'
                }`}
              >
                {m.text}
              </div>
            ))}
            {chatBusy && <p className="text-[#8E8EA2]">Generating reply...</p>}
          </div>
          <form onSubmit={handleChatSend} className="p-3 border-t border-[#20202D] flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about stock, price, delivery..."
              className="flex-1 rounded-md border border-[#282838] bg-[#09090D] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatBusy}
              className="p-2 rounded-md bg-gold-gradient text-[#08080A]"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
      {/* Module 15: Storefront Appointment / Consultation Modal */}
      {bookingOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2A2A38] bg-[#0D0D13] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-luxury text-lg font-bold text-white">Book Appointment · {tenant.name}</h3>
              <button type="button" onClick={() => setBookingOpen(false)} aria-label="Close booking form" className="inline-flex h-11 w-11 items-center justify-center text-[#8E8EA2] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (blockDemoWrite()) return;
                setBookingBusy(true);
                try {
                  await apiFetch(`/api/tenants/${tenant.slug}/appointments`, {
                    method: 'POST',
                    body: JSON.stringify({
                      customerName: bookName.trim(),
                      customerPhone: bookPhone.trim(),
                      customerEmail: profile?.email || '',
                      serviceName: bookService.trim(),
                      bookingDate: bookDate,
                      timeSlot: bookSlot,
                      notes: bookNotes.trim(),
                    }),
                  });
                  setBookingOpen(false);
                  setBookNotes('');
                  onNotify(`Appointment confirmed for ${bookDate} at ${bookSlot}!`);
                } catch (err) {
                  onNotify(err instanceof Error ? err.message : 'Unable to book slot.');
                } finally {
                  setBookingBusy(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <input
                type="text"
                required
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="Your Full Name"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <input
                type="text"
                required
                value={bookPhone}
                onChange={(e) => setBookPhone(e.target.value)}
                placeholder="Phone / WhatsApp Number"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <input
                type="text"
                required
                value={bookService}
                onChange={(e) => setBookService(e.target.value)}
                placeholder="Service / Consultation Name"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
                <select
                  value={bookSlot}
                  onChange={(e) => setBookSlot(e.target.value)}
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
                >
                  <option value="10:00 AM">10:00 AM</option>
                  <option value="11:00 AM">11:00 AM</option>
                  <option value="02:00 PM">02:00 PM</option>
                  <option value="04:30 PM">04:30 PM</option>
                  <option value="06:30 PM">06:30 PM</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={bookNotes}
                onChange={(e) => setBookNotes(e.target.value)}
                placeholder="Special requests or preferences (optional)"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <button
                type="submit"
                disabled={bookingBusy}
                className="w-full py-2.5 rounded bg-gold-gradient text-[#08080A] font-semibold"
              >
                {bookingBusy ? 'Confirming Booking...' : 'Confirm Appointment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
