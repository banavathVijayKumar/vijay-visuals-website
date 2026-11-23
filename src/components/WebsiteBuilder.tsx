import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { BUSINESS_CATEGORIES, GLOBAL_CURRENCIES } from '../data/content';
import { TEMPLATES_DATA, BusinessTemplate } from '../lib/templatesData';
import { apiFetch } from '../lib/api';
import { CustomerLogoCustomizer } from './CustomerLogoCustomizer';
import { generateSlugFromName, validateSlug } from '../lib/slug';
import { optimizeImageFileToDataUrl } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import { initiatePlatformCheckout } from '../lib/razorpayClient';
import { AiSetupDraft, GalleryItem, TenantModules, TenantRecord } from '../types/platform';

import fashionBanner from '../assets/images/store_fashion_royal_1795055802960.jpg';
import electronicsBanner from '../assets/images/store_electronics_audio_1795055804216.jpg';
import diningBanner from '../assets/images/store_gourmet_dining_1795055802368.jpg';
import groceryBanner from '../assets/images/store_grocery_organic_1795055803860.jpg';
import studioBanner from '../assets/images/hero_vijay_studio_1795055804014.jpg';

interface WebsiteBuilderProps {
  initialTenantId?: number | null;
  onPublished: (tenant: TenantRecord) => void;
  onOpenStorefront: (slug: string) => void;
  onNotify: (msg: string) => void;
}

export type BuilderPlanTier =
  | 'starter_website'
  | 'website_only'
  | 'ecommerce_website'
  | 'website_pwa'
  | 'enterprise_ai';

export const PLAN_TIER_CONFIG: Record<
  BuilderPlanTier,
  {
    code: string;
    name: string;
    base: number;
    gst: number;
    total: number;
    baseStr: string;
    gstStr: string;
    totalStr: string;
    highlight: string;
    desc: string;
  }
> = {
  starter_website: {
    code: 'starter-website',
    name: 'Starter Website Package',
    base: 2999,
    gst: 540,
    total: 3539,
    baseStr: '₹2,999',
    gstStr: '₹540',
    totalStr: '₹3,539',
    highlight: 'Essential',
    desc: 'Mobile-responsive business website across 36 industry templates, SEO & lead forms.',
  },
  website_only: {
    code: 'business-website',
    name: 'Business Website Package',
    base: 7999,
    gst: 1440,
    total: 9439,
    baseStr: '₹7,999',
    gstStr: '₹1,440',
    totalStr: '₹9,439',
    highlight: 'Most Popular',
    desc: 'Full website design, products, orders, gallery, publishing & custom domain connection.',
  },
  ecommerce_website: {
    code: 'ecommerce-website',
    name: 'E-Commerce Website Package',
    base: 14999,
    gst: 2700,
    total: 17699,
    baseStr: '₹14,999',
    gstStr: '₹2,700',
    totalStr: '₹17,699',
    highlight: 'Storefront',
    desc: 'Full e-commerce store with catalog, variants, stock alerts, coupons & GST invoices.',
  },
  website_pwa: {
    code: 'website-plus-pwa',
    name: 'Website + Branded PWA',
    base: 22999,
    gst: 4140,
    total: 27139,
    baseStr: '₹22,999',
    gstStr: '₹4,140',
    totalStr: '₹27,139',
    highlight: 'Optional PWA',
    desc: 'Everything in Business Website + installable mobile home-screen web app (PWA).',
  },
  enterprise_ai: {
    code: 'custom-dev-enterprise',
    name: 'Custom Dev & Enterprise AI',
    base: 49999,
    gst: 9000,
    total: 58999,
    baseStr: '₹49,999',
    gstStr: '₹9,000',
    totalStr: '₹58,999',
    highlight: 'Enterprise',
    desc: 'Custom workflows, dedicated AI engines, ERP sync & high-volume multi-branch routing.',
  },
};

const BANNER_PRESETS = [
  { label: 'Luxury Fashion', url: fashionBanner },
  { label: 'Electronics & Tech', url: electronicsBanner },
  { label: 'Fine Dining & Food', url: diningBanner },
  { label: 'Grocery & Fresh Mart', url: groceryBanner },
  { label: 'Creative & Studio', url: studioBanner },
];

const GALLERY_CATEGORIES = ['Showcase', 'Products', 'Banners', 'Interior', 'Portfolio', 'Menu', 'Rooms', 'Events'];

function defaultBannerForCategory(cat: string): string {
  const c = (cat || '').toLowerCase();
  if (c.includes('restaurant') || c.includes('kitchen') || c.includes('bakery') || c.includes('cafe') || c.includes('hotel')) {
    return diningBanner;
  }
  if (c.includes('grocery') || c.includes('supermarket') || c.includes('medical') || c.includes('pharmacy')) {
    return groceryBanner;
  }
  if (c.includes('electronic') || c.includes('mobile') || c.includes('education') || c.includes('fitness') || c.includes('gym')) {
    return electronicsBanner;
  }
  if (c.includes('cloth') || c.includes('fashion') || c.includes('jewel') || c.includes('salon') || c.includes('beauty')) {
    return fashionBanner;
  }
  return studioBanner;
}

function defaultModulesForCategory(cat: string): TenantModules {
  const c = (cat || '').toLowerCase();
  const isServiceOrPortfolio = [
    'photography',
    'video',
    'salon',
    'spa',
    'hotel',
    'hospital',
    'clinic',
    'dental',
    'real-estate',
    'real estate',
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
  ].some((k) => c.includes(k));

  if (isServiceOrPortfolio) {
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

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({
  initialTenantId,
  onPublished,
  onOpenStorefront,
  onNotify,
}) => {
  const { profile, ownedTenants, openAuthModal, signInWithGoogle, refreshProfile } = useAuth();
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (initialTenantId && ownedTenants.length > 0) {
      const found = ownedTenants.find((t) => t.id === initialTenantId);
      if (found) {
        loadExistingTenant(found);
      }
    }
  }, [initialTenantId, ownedTenants]);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [purchaseModalTenantId, setPurchaseModalTenantId] = useState<number | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Core business identity
  const [name, setName] = useState('Sri Lakshmi Silks & Boutique');
  const [slug, setSlug] = useState('sri-lakshmi-silks');
  const [category, setCategory] = useState<string>('Clothing Store');
  const [templateId, setTemplateId] = useState<string>('clothing-store');
  const [templateName, setTemplateName] = useState<string>('Vastra Heritage Men & Women Apparel');
  const [templateFeatures, setTemplateFeatures] = useState<string[]>([
    'Interactive Size Guide',
    'Trial At Home Available',
    'Fabric Composition Specs',
    'Express 48h Alteration',
  ]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [tagline, setTagline] = useState('Pure Kanchipuram Handlooms & Festive Bridal Wear');
  const [description, setDescription] = useState(
    'Direct from master weavers in Telangana & Tamil Nadu with nationwide doorstep delivery and custom tailoring.'
  );
  const [logoText, setLogoText] = useState('SLS');
  const [logoImage, setLogoImage] = useState('');
  const [logoStudioOpen, setLogoStudioOpen] = useState(false);
  const [bannerImage, setBannerImage] = useState(fashionBanner);
  const [primaryColor, setPrimaryColor] = useState('#D4AF37');
  const [accentColor, setAccentColor] = useState('#0D0D12');
  const [fontFamily, setFontFamily] = useState('Cinzel');
  const [customDomain, setCustomDomain] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [language, setLanguage] = useState<'en' | 'te' | 'hi'>('en');
  const [phone, setPhone] = useState('+91 93813 62201');
  const [whatsapp, setWhatsapp] = useState('919381362201');
  const [address, setAddress] = useState('Banjara Hills, Hyderabad, Telangana');
  const [businessHours, setBusinessHours] = useState('Mon–Sun: 10:00 AM – 9:30 PM');
  const [deliveryInfo, setDeliveryInfo] = useState('Same-day local delivery & 2–4 day pan-India shipping.');
  const [returnPolicy, setReturnPolicy] = useState('7-day easy exchange/return for unused items with original tags.');
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    facebook: '',
    youtube: '',
    website: '',
  });
  const [enabledModules, setEnabledModules] = useState<TenantModules>(() => defaultModulesForCategory('Clothing Store'));

  // Categorized Business Gallery Manager
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryUploadCategory, setGalleryUploadCategory] = useState('Showcase');
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Plan, PWA & Checkout config
  const [planTier, setPlanTier] = useState<BuilderPlanTier>('website_only');
  const [pwaEnabled, setPwaEnabled] = useState(true);
  const [pwaAppName, setPwaAppName] = useState('Sri Lakshmi Silks');
  const [pwaShortName, setPwaShortName] = useState('LakshmiSilk');
  const [pwaThemeColor, setPwaThemeColor] = useState('#08080A');
  const [deliveryFee, setDeliveryFee] = useState(49);
  const [codEnabled, setCodEnabled] = useState(true);
  const [upiId, setUpiId] = useState('');

  // Form & Slug state
  const [saving, setSaving] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string | null;
    suggestedSlug: string | null;
  }>({ checking: false, available: null, message: null, suggestedSlug: null });
  const [formError, setFormError] = useState<string | null>(null);

  // AI Business Setup Assistant
  const [aiBrief, setAiBrief] = useState('');
  const [aiLang, setAiLang] = useState<'en' | 'te' | 'hi'>('en');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiSetupDraft | null>(null);

  // Section Order, Custom Pages, Draft Snapshots & Publish Control
  const [sectionOrder, setSectionOrder] = useState<string[]>(['hero', 'catalog', 'gallery', 'booking', 'contact']);
  const [customPages, setCustomPages] = useState<Array<{ slug: string; title: string; content: string; inNav?: boolean }>>([
    { slug: 'about', title: 'About Us', content: 'Welcome to our official business website.', inNav: true },
    { slug: 'shipping-returns', title: 'Shipping & Returns', content: 'Transparent delivery timelines and customer-friendly return guidelines.', inNav: true },
  ]);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageContent, setNewPageContent] = useState('');
  const [sitePublished, setSitePublished] = useState(true);
  const [versions, setVersions] = useState<Array<{ id: number; versionNumber: number; label: string; createdAt: string }>>([]);
  const [draftLabel, setDraftLabel] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return TEMPLATES_DATA;
    return TEMPLATES_DATA.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.badge.toLowerCase().includes(q)
    );
  }, [templateSearch]);

  const loadTenantEditorMeta = useCallback(async (tenantId: number) => {
    try {
      const [verRes, seoRes] = await Promise.all([
        apiFetch<{ versions: Array<{ id: number; versionNumber: number; label: string; createdAt: string }>; published: boolean }>(
          `/api/owner/tenants/${tenantId}/versions`
        ),
        apiFetch<{ seo: { sectionOrderJson?: string; customPagesJson?: string } }>(`/api/owner/tenants/${tenantId}/seo`),
      ]);
      setVersions(verRes.versions || []);
      setSitePublished(Boolean(verRes.published));
      if (seoRes.seo?.sectionOrderJson) {
        try {
          const parsedOrder = JSON.parse(seoRes.seo.sectionOrderJson);
          if (Array.isArray(parsedOrder) && parsedOrder.length > 0) setSectionOrder(parsedOrder);
        } catch {}
      }
      if (seoRes.seo?.customPagesJson) {
        try {
          const parsedPages = JSON.parse(seoRes.seo.customPagesJson);
          if (Array.isArray(parsedPages)) setCustomPages(parsedPages);
        } catch {}
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (editingTenantId && profile) {
      loadTenantEditorMeta(editingTenantId);
    }
  }, [editingTenantId, profile, loadTenantEditorMeta]);

  const moveSection = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= sectionOrder.length) return;
    const copy = [...sectionOrder];
    const [item] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, item);
    setSectionOrder(copy);
  };

  const handleSaveLayoutAndPages = async () => {
    if (!editingTenantId) {
      onNotify('Publish your website first, then save custom section order & navigation pages.');
      return;
    }
    try {
      await apiFetch(`/api/owner/tenants/${editingTenantId}/seo`, {
        method: 'PUT',
        body: JSON.stringify({
          sectionOrderJson: JSON.stringify(sectionOrder),
          customPagesJson: JSON.stringify(customPages),
        }),
      });
      onNotify('Saved section order & custom navigation pages to Cloudflare D1.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save layout settings.');
    }
  };

  const handleSaveDraftSnapshot = async () => {
    if (!editingTenantId) {
      onNotify('Load an existing business site first to save a version snapshot.');
      return;
    }
    setSavingVersion(true);
    try {
      await apiFetch(`/api/owner/tenants/${editingTenantId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ label: draftLabel.trim() || 'Saved Draft Snapshot' }),
      });
      setDraftLabel('');
      onNotify('Draft version snapshot saved! You can restore it anytime.');
      loadTenantEditorMeta(editingTenantId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save draft snapshot.');
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!editingTenantId) return;
    try {
      const res = await apiFetch<{ tenant: TenantRecord; restoredVersion: number }>(
        `/api/owner/tenants/${editingTenantId}/versions/${versionId}/restore`,
        { method: 'POST' }
      );
      loadExistingTenant(res.tenant);
      await refreshProfile();
      onPublished(res.tenant);
      onNotify(`Restored website snapshot v${res.restoredVersion}!`);
      loadTenantEditorMeta(editingTenantId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to restore version.');
    }
  };

  const handleTogglePublish = async () => {
    if (!editingTenantId) return;
    try {
      const res = await apiFetch<{ tenant: TenantRecord }>(`/api/owner/tenants/${editingTenantId}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !sitePublished }),
      });
      setSitePublished(res.tenant.published);
      await refreshProfile();
      onPublished(res.tenant);
      onNotify(res.tenant.published ? 'Website is now PUBLISHED live!' : 'Website switched to DRAFT / Unpublished mode.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update publish state.';
      if (
        msg.toLowerCase().includes('payment') ||
        msg.toLowerCase().includes('subscription') ||
        msg.toLowerCase().includes('package')
      ) {
        setPurchaseModalTenantId(editingTenantId);
        setPublishModalOpen(true);
      }
      onNotify(msg);
    }
  };

  const handlePurchaseAndPublish = async () => {
    if (!profile) {
      openAuthModal('signin');
      return;
    }
    setCheckoutBusy(true);
    try {
      const selectedTier = PLAN_TIER_CONFIG[planTier] || PLAN_TIER_CONFIG.website_only;
      await initiatePlatformCheckout({
        planCode: selectedTier.code,
        planName: `${selectedTier.name} (${selectedTier.totalStr})`,
        websiteId: purchaseModalTenantId
          ? String(purchaseModalTenantId)
          : editingTenantId
            ? String(editingTenantId)
            : undefined,
        publishWebsite: true,
        prefill: {
          name: profile?.name || '',
          email: profile?.email || '',
          contact: profile?.phone || '',
        },
        onSuccess: async (verifyRes) => {
          setPublishModalOpen(false);
          setSitePublished(true);
          await refreshProfile();
          setPublishedSlug(slug);
          onNotify(`Payment verified! "${name}" is now live with the ${selectedTier.name}.`);
          if (verifyRes.verified) {
            const targetId = purchaseModalTenantId || editingTenantId;
            const existing = ownedTenants.find((t) => t.id === targetId);
            if (existing) {
              onPublished({ ...existing, published: true, status: 'active' });
            }
          }
        },
        onError: (err) => {
          onNotify(err.message || 'Payment verification failed.');
        },
        onDismiss: () => {
          onNotify('Payment checkout was closed.');
        },
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to initialize Razorpay checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleGenerateAiBlueprint = async () => {
    if (!profile) {
      await signInWithGoogle();
      return;
    }
    if (aiBrief.trim().length < 12) {
      onNotify('Describe your business in at least 12 characters for the AI Setup Assistant.');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await apiFetch<{ draft: AiSetupDraft }>('/api/ai/setup-assistant', {
        method: 'POST',
        body: JSON.stringify({ businessBrief: aiBrief.trim(), language: aiLang }),
      });
      setAiDraft(res.draft);
      onNotify('AI blueprint generated! Review the draft below and click Approve to apply.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI Business Setup Assistant failed.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApproveAiDraft = () => {
    if (!aiDraft) return;
    const nextName = aiDraft.name || name;
    setName(nextName);
    if (!editingTenantId) {
      const cleanAiSlug = generateSlugFromName(aiDraft.slug || nextName);
      if (cleanAiSlug) {
        setSlug(cleanAiSlug);
        setSlugManuallyEdited(false);
      }
    }
    const validCat = BUSINESS_CATEGORIES.find((c) => c.id === aiDraft.category);
    if (validCat) {
      setCategory(validCat.label);
      setBannerImage(defaultBannerForCategory(validCat.label));
      setEnabledModules(defaultModulesForCategory(validCat.label));
    }
    if (aiDraft.tagline) setTagline(aiDraft.tagline);
    if (aiDraft.description) setDescription(aiDraft.description);
    if (aiDraft.logoText) setLogoText(aiDraft.logoText.slice(0, 5).toUpperCase());
    if (aiDraft.primaryColor?.startsWith('#')) setPrimaryColor(aiDraft.primaryColor);
    if (aiDraft.accentColor?.startsWith('#')) setAccentColor(aiDraft.accentColor);
    if (aiDraft.seoTitle) setSeoTitle(aiDraft.seoTitle);
    if (aiDraft.seoDescription) setSeoDescription(aiDraft.seoDescription);
    setLanguage(aiLang);
    setPwaAppName(aiDraft.name || pwaAppName);
    setPwaShortName((aiDraft.name || pwaShortName).slice(0, 12));
    setFormError(null);
    onNotify('Owner approved! AI blueprint applied to your website editor.');
  };

  const loadExistingTenant = (t: TenantRecord) => {
    setEditingTenantId(t.id);
    setName(t.name);
    setSlug(t.slug);
    setSlugManuallyEdited(true);
    setFormError(null);
    setCategory(t.category || 'General Business');
    setTemplateId(t.templateId || 'general-business');
    setTemplateName(t.templateName || '');
    setTemplateFeatures(Array.isArray(t.templateFeatures) ? t.templateFeatures : []);
    setTagline(t.tagline || '');
    setDescription(t.description || '');
    setLogoText(t.logoText || 'VV');
    setLogoImage(t.logoImage || '');
    setBannerImage(t.bannerImage || defaultBannerForCategory(t.category));
    setPrimaryColor(t.primaryColor || '#D4AF37');
    setAccentColor(t.accentColor || '#0D0D12');
    setFontFamily(t.fontFamily || 'Cinzel');
    setCustomDomain(t.customDomain || '');
    setSeoTitle(t.seoTitle || '');
    setSeoDescription(t.seoDescription || '');
    setCurrency(t.currency || 'INR');
    setLanguage((['en', 'te', 'hi'].includes(t.language || '') ? t.language : 'en') as 'en' | 'te' | 'hi');
    setPhone(t.phone || '');
    setWhatsapp(t.whatsapp || '');
    setAddress(t.address || '');
    setBusinessHours(t.businessHours || '');
    setDeliveryInfo(t.deliveryInfo || '');
    setReturnPolicy(t.returnPolicy || '');
    setSocialLinks({
      instagram: t.socialLinks?.instagram || '',
      facebook: t.socialLinks?.facebook || '',
      youtube: t.socialLinks?.youtube || '',
      website: t.socialLinks?.website || '',
    });
    setEnabledModules(t.enabledModules || defaultModulesForCategory(t.category));
    if (Array.isArray(t.galleryItems) && t.galleryItems.length > 0) {
      setGalleryItems(t.galleryItems);
    } else if (Array.isArray(t.galleryImages) && t.galleryImages.length > 0) {
      setGalleryItems(
        t.galleryImages.map((url, idx) => ({
          id: `gal_${idx + 1}`,
          url,
          title: '',
          description: '',
          category: 'Showcase',
          order: idx,
        }))
      );
    } else {
      setGalleryItems([]);
    }
    setPlanTier(t.planTier || 'website_only');
    setPwaEnabled(Boolean(t.pwaEnabled));
    setPwaAppName(t.pwaAppName || t.name);
    setPwaShortName(t.pwaShortName || t.name.slice(0, 12));
    setPwaThemeColor(t.pwaThemeColor || '#08080A');
    setDeliveryFee(t.deliveryFee || 0);
    setCodEnabled(t.codEnabled !== false);
    setUpiId(t.upiId || '');
    setSitePublished(t.published !== false);
    if (Array.isArray(t.sectionOrder) && t.sectionOrder.length > 0) setSectionOrder(t.sectionOrder);
    if (Array.isArray(t.customPages) && t.customPages.length > 0) setCustomPages(t.customPages);
    onNotify(`Loaded "${t.name}" into Website Builder.`);
  };

  const applyIndustryTemplate = (tpl: BusinessTemplate) => {
    setTemplateId(tpl.id);
    setTemplateName(tpl.name);
    setTemplateFeatures(tpl.features);
    setCategory(tpl.category);
    setPrimaryColor(tpl.accent_color || '#D4AF37');
    setBannerImage(defaultBannerForCategory(tpl.category));
    setEnabledModules(defaultModulesForCategory(tpl.category));
    if (!editingTenantId) {
      setTagline(tpl.description.slice(0, 120));
      setDescription(tpl.description);
    }
    onNotify(`Applied "${tpl.category}" template (${tpl.name}).`);
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await optimizeImageFileToDataUrl(file, 400);
      setLogoImage(dataUrl);
      onNotify('Business logo uploaded & optimized.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid logo image.');
    }
  };

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await optimizeImageFileToDataUrl(file, 1280);
      setBannerImage(dataUrl);
      onNotify('Hero banner image uploaded & optimized.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid banner image.');
    }
  };

  const handleUploadGalleryFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setGalleryUploading(true);
    try {
      const nextItems: GalleryItem[] = [];
      for (const file of files.slice(0, Math.max(0, 18 - galleryItems.length))) {
        const url = await optimizeImageFileToDataUrl(file, 1080);
        nextItems.push({
          id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          url,
          title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80),
          description: '',
          category: galleryUploadCategory,
          order: galleryItems.length + nextItems.length,
        });
      }
      setGalleryItems((prev) => [...prev, ...nextItems].slice(0, 18));
      onNotify(`Added ${nextItems.length} optimized photo(s) to "${galleryUploadCategory}" album.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to upload gallery photo.');
    } finally {
      setGalleryUploading(false);
    }
  };

  const moveGalleryItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= galleryItems.length) return;
    setGalleryItems((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy.map((g, i) => ({ ...g, order: i }));
    });
  };

  const suggestedSlugFromName = useMemo(() => generateSlugFromName(name), [name]);
  const slugValidation = useMemo(() => validateSlug(slug), [slug]);
  const sanitizedSlug = slugValidation.valid ? slugValidation.normalized : slugValidation.normalized || suggestedSlugFromName;

  useEffect(() => {
    if (!slugValidation.valid) {
      setSlugStatus({
        checking: false,
        available: false,
        message: slugValidation.error,
        suggestedSlug: slugValidation.normalized || suggestedSlugFromName || null,
      });
      return;
    }

    let cancelled = false;
    setSlugStatus((prev) => ({ ...prev, checking: true }));
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug: slugValidation.normalized, name });
        if (editingTenantId) params.set('excludeTenantId', String(editingTenantId));
        const res = await apiFetch<{
          valid: boolean;
          available: boolean;
          error?: string;
          message?: string;
          suggestedSlug?: string;
        }>(`/api/tenants/check-slug?${params.toString()}`);
        if (cancelled) return;
        setSlugStatus({
          checking: false,
          available: res.valid && res.available,
          message: res.available ? res.message || `Available: /site/${slugValidation.normalized}` : res.error || 'Slug is not available.',
          suggestedSlug: res.suggestedSlug || null,
        });
      } catch {
        if (!cancelled) {
          setSlugStatus({ checking: false, available: null, message: null, suggestedSlug: null });
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, slugValidation.valid, slugValidation.error, slugValidation.normalized, name, suggestedSlugFromName, editingTenantId]);

  const handlePublish = async (e: React.FormEvent, publishIntent: boolean = true) => {
    e.preventDefault();
    setFormError(null);

    if (!profile) {
      openAuthModal('signin');
      onNotify('Please sign in to save or publish your website.');
      return;
    }

    const currentCheck = validateSlug(slug);
    if (!currentCheck.valid) {
      const msg = currentCheck.error || 'Enter a valid URL slug (lowercase letters, numbers, and single hyphens).';
      setFormError(msg);
      onNotify(msg);
      return;
    }

    setSaving(true);
    try {
      const checkParams = new URLSearchParams({ slug: currentCheck.normalized, name });
      if (editingTenantId) checkParams.set('excludeTenantId', String(editingTenantId));
      const availability = await apiFetch<{
        valid: boolean;
        available: boolean;
        error?: string;
        suggestedSlug?: string;
      }>(`/api/tenants/check-slug?${checkParams.toString()}`);

      if (!availability.valid || !availability.available) {
        const msg = availability.error || 'This website URL slug is unavailable. Choose another unique slug.';
        setSlugStatus({
          checking: false,
          available: false,
          message: msg,
          suggestedSlug: availability.suggestedSlug || null,
        });
        setFormError(msg);
        onNotify(msg);
        return;
      }

      const orderedGallery = galleryItems.map((g, idx) => ({ ...g, order: idx }));

      const payload = {
        name: name.trim(),
        slug: currentCheck.normalized,
        category,
        templateId,
        templateName,
        templateFeatures,
        tagline: tagline.trim(),
        description: description.trim(),
        logoText: logoText.trim().slice(0, 6) || 'VV',
        logoImage,
        bannerImage,
        galleryItems: orderedGallery,
        galleryImages: orderedGallery.map((g) => g.url),
        primaryColor,
        accentColor,
        fontFamily,
        customDomain: customDomain.trim(),
        seoTitle: seoTitle.trim(),
        seoDescription: seoDescription.trim(),
        currency,
        language,
        phone: phone.trim(),
        whatsapp: whatsapp.replace(/\D/g, ''),
        address: address.trim(),
        businessHours: businessHours.trim(),
        deliveryInfo: deliveryInfo.trim(),
        returnPolicy: returnPolicy.trim(),
        socialLinks,
        enabledModules,
        sectionOrder,
        customPages,
        planTier,
        pwaEnabled: planTier !== 'website_only' && pwaEnabled,
        pwaAppName: pwaAppName.trim() || name.trim(),
        pwaShortName: (pwaShortName.trim() || name.trim()).slice(0, 12),
        pwaThemeColor,
        deliveryFee: Number(deliveryFee) || 0,
        codEnabled,
        upiId: upiId.trim(),
        published: publishIntent,
        status: publishIntent ? 'active' : 'unpublished',
      };

      if (!publishIntent) {
        const res = editingTenantId
          ? await apiFetch<{ tenant: TenantRecord }>(`/api/tenants/${editingTenantId}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            })
          : await apiFetch<{ tenant: TenantRecord }>('/api/tenants', {
              method: 'POST',
              body: JSON.stringify(payload),
            });

        await refreshProfile();
        setEditingTenantId(res.tenant.id);
        setSitePublished(false);
        setSlug(res.tenant.slug);
        setFormError(null);
        onPublished(res.tenant);
        onNotify(`Draft saved for "${res.tenant.name}"! You can customize design, products, and gallery anytime.`);
        return;
      }

      try {
        const res = editingTenantId
          ? await apiFetch<{ tenant: TenantRecord }>(`/api/tenants/${editingTenantId}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            })
          : await apiFetch<{ tenant: TenantRecord }>('/api/tenants', {
              method: 'POST',
              body: JSON.stringify(payload),
            });

        await refreshProfile();
        setEditingTenantId(res.tenant.id);
        setPublishedSlug(res.tenant.slug);
        setSitePublished(true);
        setSlug(res.tenant.slug);
        setFormError(null);
        onPublished(res.tenant);
        onNotify(
          editingTenantId
            ? `Saved updates to "${res.tenant.name}" — live at /site/${res.tenant.slug}.`
            : `Published "${res.tenant.name}" live at /site/${res.tenant.slug}!`
        );
      } catch (publishErr) {
        const pMsg = publishErr instanceof Error ? publishErr.message : 'Unable to publish website.';
        const isPaymentRequired =
          pMsg.toLowerCase().includes('payment') ||
          pMsg.toLowerCase().includes('subscription') ||
          pMsg.toLowerCase().includes('package');

        if (isPaymentRequired) {
          let savedId = editingTenantId;
          if (!savedId) {
            try {
              const draftSave = await apiFetch<{ tenant: TenantRecord }>('/api/tenants', {
                method: 'POST',
                body: JSON.stringify({ ...payload, published: false, status: 'unpublished' }),
              });
              savedId = draftSave.tenant.id;
              setEditingTenantId(draftSave.tenant.id);
              setSitePublished(false);
              await refreshProfile();
            } catch {
              // ignore
            }
          }
          setPurchaseModalTenantId(savedId);
          setPublishModalOpen(true);
          setFormError('Business Website Package (₹7,999) required to publish live. Complete payment below to activate.');
        } else {
          throw publishErr;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save website.';
      setFormError(msg);
      onNotify(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-medium text-[#D4AF37] mb-1">
            Multi-Tenant Website & E-Commerce Builder · {TEMPLATES_DATA.length} Industry Templates
          </p>
          <h1 className="font-luxury text-2xl md:text-3xl font-bold text-white">
            Create & Customize Your Business Website
          </h1>
        </div>
        {ownedTenants.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#8E8EA2]">Your websites:</span>
            {ownedTenants.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => loadExistingTenant(t)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                  editingTenantId === t.id
                    ? 'border-[#D4AF37] bg-[#1C1A12] text-[#ECC86A]'
                    : 'border-[#262634] bg-[#0F0F16] text-[#B8B8C8] hover:text-white'
                }`}
              >
                {t.name}
              </button>
            ))}
            {editingTenantId && (
              <button
                type="button"
                onClick={() => {
                  setEditingTenantId(null);
                  setSlug(`brand-${Date.now().toString().slice(-4)}`);
                  setSlugManuallyEdited(false);
                  setGalleryItems([]);
                  setLogoImage('');
                }}
                className="px-3 py-1.5 rounded-md text-xs text-[#ECC86A] hover:underline"
              >
                + New Business
              </button>
            )}
          </div>
        )}
      </div>

      {/* AI Business Setup Assistant */}
      <div className="mb-8 rounded-xl border border-[#D4AF37]/30 bg-[#101017] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-sm font-semibold text-white">
              AI Business Setup Assistant (Describe Your Business in Plain Language)
            </h2>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            {(['en', 'te', 'hi'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setAiLang(l)}
                className={`px-2 py-1 rounded ${
                  aiLang === l ? 'bg-[#D4AF37] text-[#08080A] font-semibold' : 'text-[#A3A3B5]'
                }`}
              >
                {l === 'en' ? 'EN' : l === 'te' ? 'తెలుగు' : 'हिन्दी'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={aiBrief}
            onChange={(e) => setAiBrief(e.target.value)}
            placeholder="e.g. Authentic Hyderabadi cloud kitchen & catering in Jubilee Hills offering biryani boxes and WhatsApp ordering"
            className="flex-1 rounded-md border border-[#2A2A38] bg-[#08080C] px-3.5 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
          />
          <button
            type="button"
            disabled={aiGenerating}
            onClick={handleGenerateAiBlueprint}
            className="px-5 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold shrink-0 disabled:opacity-60"
          >
            {aiGenerating ? 'Generating Blueprint...' : 'Generate AI Website Draft'}
          </button>
        </div>

        {aiDraft && (
          <div className="rounded-lg border border-amber-500/30 bg-[#09090D] p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[#ECC86A] font-semibold">
                  Draft Ready for Approval: {aiDraft.name} ({aiDraft.category})
                </p>
                <p className="text-[11px] text-[#A3A3B5]">{aiDraft.tagline}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApproveAiDraft}
                  className="px-3.5 py-1.5 rounded bg-emerald-600 text-white font-semibold"
                >
                  Approve & Apply
                </button>
                <button
                  type="button"
                  onClick={() => setAiDraft(null)}
                  className="px-3 py-1.5 rounded border border-[#2A2A38] text-[#A3A3B5]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Configuration Form */}
        <form
          onSubmit={handlePublish}
          className="lg:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-6"
        >
          {/* 01. Business Identity */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-3">01. Business Identity & URL</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Business Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setName(nextName);
                    if (!editingTenantId && !slugManuallyEdited) {
                      setSlug(generateSlugFromName(nextName));
                    }
                  }}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-sm text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#9D9DB0] mb-1">Website Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'te' | 'hi')}
                    className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="en">English</option>
                    <option value="te">తెలుగు (Telugu)</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-[#9D9DB0]">Logo Customization</label>
                    <button
                      type="button"
                      onClick={() => setLogoStudioOpen(true)}
                      className="text-[11px] text-[#ECC86A] hover:underline flex items-center gap-1 font-medium"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Open Logo Studio</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={5}
                      value={logoText}
                      onChange={(e) => setLogoText(e.target.value.toUpperCase())}
                      className="w-20 rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white font-luxury"
                    />
                    <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D4AF37]/40 bg-[#14120A] px-2 py-2 text-[11px] text-[#ECC86A] cursor-pointer hover:bg-[#1E1A0E]">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{logoImage ? 'Change Logo' : 'Upload Logo'}</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUploadLogo} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-[#9D9DB0]">Unique Store URL Slug</label>
                      {suggestedSlugFromName && slug !== suggestedSlugFromName && (
                        <button
                          type="button"
                          onClick={() => {
                            setSlug(suggestedSlugFromName);
                            setSlugManuallyEdited(false);
                            setFormError(null);
                          }}
                          className="text-[10px] text-[#ECC86A] hover:underline"
                        >
                          Use suggested
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value);
                        setSlugManuallyEdited(true);
                        setFormError(null);
                      }}
                      placeholder="your-business-slug"
                      className={`w-full rounded-md border bg-[#08080C] px-3 py-2 text-xs font-mono-tabular focus:outline-none ${
                        !slugValidation.valid || slugStatus.available === false
                          ? 'border-rose-500/70 text-rose-200'
                          : slugStatus.available === true
                            ? 'border-emerald-500/60 text-emerald-200'
                            : 'border-[#2A2A38] text-[#ECC86A]'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9D9DB0] mb-1">Custom Domain (Optional)</label>
                    <input
                      type="text"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="shop.yourdomain.in"
                      className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-[#1E1E2B] bg-[#09090D] px-3 py-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#8E8EA2] font-mono-tabular truncate">
                      Live URL: /site/{slug || suggestedSlugFromName || 'your-business'}
                    </span>
                    {slugStatus.checking ? (
                      <span className="inline-flex items-center gap-1 text-[#ECC86A] shrink-0">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                      </span>
                    ) : !slugValidation.valid || slugStatus.available === false ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-medium shrink-0">
                        <AlertCircle className="w-3 h-3" /> {!slugValidation.valid ? 'Invalid' : 'Taken'}
                      </span>
                    ) : slugStatus.available === true ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Available
                      </span>
                    ) : null}
                  </div>
                  {(!slugValidation.valid || slugStatus.available === false) && slugStatus.message && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-rose-300">
                      <span>{slugStatus.message}</span>
                      {slugStatus.suggestedSlug && slugStatus.suggestedSlug !== slug && (
                        <button
                          type="button"
                          onClick={() => {
                            setSlug(slugStatus.suggestedSlug!);
                            setSlugManuallyEdited(true);
                            setFormError(null);
                          }}
                          className="px-2 py-0.5 rounded border border-[#D4AF37]/50 text-[#ECC86A] font-mono-tabular font-semibold"
                        >
                          Use "{slugStatus.suggestedSlug}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Headline Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">About Your Business</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* 02. Industry Template Picker (All 36 Templates) */}
          <div className="border-t border-[#1E1E2B] pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">
                02. Industry Template ({TEMPLATES_DATA.length} Ready Designs)
              </h2>
              <span className="text-[11px] text-[#ECC86A]">{category}</span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#78788E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates (Grocery, Cloud Kitchen, Jewellery, Salon, Hotel...)"
                className="w-full pl-8 pr-3 py-2 rounded-md border border-[#2A2A38] bg-[#08080C] text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {filteredTemplates.map((tpl) => {
                const selected = templateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyIndustryTemplate(tpl)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                      selected
                        ? 'border-[#D4AF37] bg-[#19170F] text-white'
                        : 'border-[#242432] bg-[#09090D] text-[#A3A3B5] hover:border-[#3A3A4E]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-white truncate">{tpl.category}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tpl.accent_color }}
                      />
                    </div>
                    <p className="text-[11px] text-[#9E9EB2] mt-0.5 line-clamp-1">{tpl.name}</p>
                    <p className="text-[10px] text-[#7D7D92] mt-1 line-clamp-1">
                      {tpl.features.slice(0, 2).join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-[#9D9DB0] mb-1">Brand Color</label>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full h-9 rounded border border-[#2A2A38] bg-[#08080C] p-1 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9D9DB0] mb-1">Surface Tone</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full h-9 rounded border border-[#2A2A38] bg-[#08080C] p-1 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9D9DB0] mb-1">Display Font</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full h-9 rounded-md border border-[#2A2A38] bg-[#08080C] px-2 text-xs text-white"
                >
                  <option value="Cinzel">Cinzel (Luxury Serif)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#9D9DB0]">Hero Banner Image</span>
                <label className="inline-flex items-center gap-1 text-[11px] text-[#ECC86A] cursor-pointer hover:underline">
                  <Upload className="w-3 h-3" />
                  <span>Upload Custom Banner</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUploadBanner} className="hidden" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BANNER_PRESETS.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => setBannerImage(b.url)}
                    className={`px-2.5 py-1 rounded text-[11px] border ${
                      bannerImage === b.url
                        ? 'border-[#D4AF37] text-[#ECC86A] bg-[#18160E]'
                        : 'border-[#252534] text-[#9B9BAE]'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 03. Configurable Business Modules (Template-Specific Modularity) */}
          <div className="border-t border-[#1E1E2B] pt-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-sm font-semibold text-white">03. Business Feature Modules</h2>
            </div>
            <p className="text-[11px] text-[#8E8EA2]">
              Enable only the modules appropriate for your business category (e.g. disable Cart for Photography/Services).
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(
                [
                  ['ecommerce', 'Product Catalogue'],
                  ['cartCheckout', 'Shopping Cart & Checkout'],
                  ['gallery', 'Business Photo Gallery'],
                  ['bookings', 'Appointments / Bookings'],
                  ['whatsappOrder', 'WhatsApp Ordering'],
                  ['reviews', 'Customer Reviews'],
                  ['wishlist', 'Customer Wishlist'],
                  ['coupons', 'Promo Coupons'],
                  ['wholesale', 'Wholesale / Bulk Tier'],
                ] as Array<[keyof TenantModules, string]>
              ).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer ${
                    enabledModules[key]
                      ? 'border-[#D4AF37]/40 bg-[#17140B] text-white'
                      : 'border-[#222230] bg-[#09090D] text-[#8E8EA2]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(enabledModules[key])}
                    onChange={(e) =>
                      setEnabledModules((prev) => ({
                        ...prev,
                        [key]: e.target.checked,
                      }))
                    }
                    className="accent-[#D4AF37]"
                  />
                  <span className="text-[11px]">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 04. Business Gallery & Media Manager */}
          <div className="border-t border-[#1E1E2B] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
                <span>04. Business Gallery ({galleryItems.length}/18)</span>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={galleryUploadCategory}
                onChange={(e) => setGalleryUploadCategory(e.target.value)}
                className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
              >
                {GALLERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    Album: {c}
                  </option>
                ))}
              </select>
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D4AF37]/50 bg-[#17140B] px-3 py-2 text-xs text-[#ECC86A] font-medium cursor-pointer hover:bg-[#221D10]">
                <Upload className="w-3.5 h-3.5" />
                <span>{galleryUploading ? 'Optimizing...' : 'Upload Photos / Banners'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  disabled={galleryUploading || galleryItems.length >= 18}
                  onChange={handleUploadGalleryFiles}
                  className="hidden"
                />
              </label>
            </div>

            {galleryItems.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {galleryItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[#222230] bg-[#09090D] p-2.5 flex items-start gap-2.5"
                  >
                    <img
                      src={item.url}
                      alt={item.title || 'Gallery photo'}
                      className="w-14 h-14 rounded object-cover shrink-0 border border-[#282838]"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) =>
                            setGalleryItems((prev) =>
                              prev.map((g, i) => (i === idx ? { ...g, title: e.target.value } : g))
                            )
                          }
                          placeholder="Image title"
                          className="flex-1 rounded border border-[#262634] bg-[#0E0E15] px-2 py-1 text-[11px] text-white"
                        />
                        <select
                          value={item.category}
                          onChange={(e) =>
                            setGalleryItems((prev) =>
                              prev.map((g, i) => (i === idx ? { ...g, category: e.target.value } : g))
                            )
                          }
                          className="rounded border border-[#262634] bg-[#0E0E15] px-1.5 py-1 text-[11px] text-[#ECC86A]"
                        >
                          {GALLERY_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          setGalleryItems((prev) =>
                            prev.map((g, i) => (i === idx ? { ...g, description: e.target.value } : g))
                          )
                        }
                        placeholder="Short caption / description (optional)"
                        className="w-full rounded border border-[#262634] bg-[#0E0E15] px-2 py-1 text-[11px] text-[#B8B8C8]"
                      />
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveGalleryItem(idx, -1)}
                        className="p-1 text-[#8E8EA2] hover:text-white"
                        aria-label="Move image up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGalleryItem(idx, 1)}
                        className="p-1 text-[#8E8EA2] hover:text-white"
                        aria-label="Move image down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGalleryItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-400 hover:text-rose-300"
                        aria-label="Remove image"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 05. Package & Optional Branded PWA */}
          <div className="border-t border-[#1E1E2B] pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">05. Select Website Package</h2>
              <span className="text-[11px] text-[#8E8EA2]">Draft is free · Package activates upon live publishing</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-3">
              {(Object.keys(PLAN_TIER_CONFIG) as BuilderPlanTier[]).map((tierKey) => {
                const tier = PLAN_TIER_CONFIG[tierKey];
                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={() => {
                      setPlanTier(tierKey);
                      setPwaEnabled(tierKey === 'website_pwa' || tierKey === 'enterprise_ai');
                    }}
                    className={`p-3 rounded-lg text-left border transition-all ${
                      planTier === tierKey
                        ? 'border-[#D4AF37] bg-[#16130C] text-white shadow-sm ring-1 ring-[#D4AF37]/50'
                        : 'border-[#222232] bg-[#0A0A0F] text-[#9E9EB2] hover:border-[#333348]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">{tier.name}</span>
                      <span className="text-[10px] font-semibold text-[#D4AF37] px-1.5 py-0.5 rounded bg-[#D4AF37]/15">
                        {tier.highlight}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mb-1.5 font-mono-tabular">
                      <span className="text-sm font-bold text-[#ECC86A]">{tier.baseStr}</span>
                      <span className="text-[10px] text-[#7A7A8E]">+ 18% GST (Total {tier.totalStr})</span>
                    </div>
                    <p className="text-[10px] text-[#8E8EA2] line-clamp-2 leading-relaxed">{tier.desc}</p>
                  </button>
                );
              })}
            </div>

            {planTier !== 'website_only' && (
              <div className="rounded-lg border border-[#252534] bg-[#09090D] p-3.5 space-y-3">
                <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pwaEnabled}
                    onChange={(e) => setPwaEnabled(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>Enable Installable Branded Progressive Web App</span>
                </label>
                {pwaEnabled && (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-[#9A9AAE] mb-1">App Name</label>
                      <input
                        type="text"
                        value={pwaAppName}
                        onChange={(e) => setPwaAppName(e.target.value)}
                        className="w-full rounded border border-[#2A2A38] bg-[#0D0D13] px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9A9AAE] mb-1">Short (≤12)</label>
                      <input
                        type="text"
                        maxLength={12}
                        value={pwaShortName}
                        onChange={(e) => setPwaShortName(e.target.value)}
                        className="w-full rounded border border-[#2A2A38] bg-[#0D0D13] px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9A9AAE] mb-1">Theme</label>
                      <input
                        type="color"
                        value={pwaThemeColor}
                        onChange={(e) => setPwaThemeColor(e.target.value)}
                        className="w-full h-8 rounded border border-[#2A2A38] bg-[#0D0D13] p-0.5 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 06. Contact, Hours, Payments, Policies & Socials */}
          <div className="border-t border-[#1E1E2B] pt-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">06. Contact, Payments, Hours & Policies</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Store Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">WhatsApp Number</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="919381362201"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Merchant UPI ID (Optional)</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="yourstore@upi"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Delivery Fee (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value))}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-xs text-[#D4D4E2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={codEnabled}
                    onChange={(e) => setCodEnabled(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>Enable Cash on Delivery (COD) at Checkout</span>
                </label>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9D9DB0] mb-1">Business Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9D9DB0] mb-1">Business Hours</label>
                <input
                  type="text"
                  value={businessHours}
                  onChange={(e) => setBusinessHours(e.target.value)}
                  placeholder="Mon–Sat: 10 AM – 9 PM | Sun: 11 AM – 7 PM"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9D9DB0] mb-1">Delivery Information</label>
                <input
                  type="text"
                  value={deliveryInfo}
                  onChange={(e) => setDeliveryInfo(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9D9DB0] mb-1">Return & Cancellation Policy</label>
                <textarea
                  rows={2}
                  value={returnPolicy}
                  onChange={(e) => setReturnPolicy(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Instagram URL</label>
                <input
                  type="url"
                  value={socialLinks.instagram}
                  onChange={(e) => setSocialLinks((s) => ({ ...s, instagram: e.target.value }))}
                  placeholder="https://instagram.com/..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Facebook / YouTube URL</label>
                <input
                  type="url"
                  value={socialLinks.facebook}
                  onChange={(e) => setSocialLinks((s) => ({ ...s, facebook: e.target.value }))}
                  placeholder="https://facebook.com/..."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">Store Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                >
                  {GLOBAL_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9D9DB0] mb-1">SEO Meta Title</label>
                <input
                  type="text"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Luxury Handloom Sarees | Hyderabad"
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-[#9D9DB0] mb-1">SEO Meta Description</label>
                <input
                  type="text"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Official online storefront with verified products, gallery & instant enquiry."
                  className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-200 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <p className="font-medium text-rose-100">{formError}</p>
                {slugStatus.suggestedSlug && slugStatus.suggestedSlug !== slug && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlug(slugStatus.suggestedSlug!);
                      setSlugManuallyEdited(true);
                      setFormError(null);
                    }}
                    className="inline-flex items-center px-2.5 py-1 rounded border border-[#D4AF37]/60 text-[#ECC86A] font-mono-tabular font-semibold"
                  >
                    Apply suggested slug: {slugStatus.suggestedSlug}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={(e) => handlePublish(e, true)}
              disabled={saving}
              className="w-full py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold hover:opacity-95 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 shadow-md"
            >
              <Globe className="w-4 h-4" />
              <span>
                {!profile
                  ? 'Sign In to Publish Your Website'
                  : saving
                    ? 'Processing Website...'
                    : editingTenantId
                      ? 'Save & Publish Live Changes'
                      : 'Publish Live Business Website'}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => handlePublish(e, false)}
              disabled={saving}
              className="w-full py-2.5 rounded-md border border-[#2B2B3C] bg-[#0E0E15] text-[#C5C5D6] text-xs font-medium hover:text-white hover:border-[#D4AF37]/50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Save className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Save as Unpublished Draft (Free)</span>
            </button>
          </div>

          {publishedSlug && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-200">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Live at /site/{publishedSlug}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenStorefront(publishedSlug)}
                className="inline-flex items-center gap-1 text-[#ECC86A] font-semibold hover:underline"
              >
                <span>Open Live Site</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>

        {/* Right: Live Responsive Preview & Layout Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-[#222230] bg-[#0D0D13] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-[#A3A3B5]">
              <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="font-mono-tabular">
                {customDomain || `vijay-visuals-site.pages.dev/site/${sanitizedSlug || 'your-store'}`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`p-1.5 rounded ${previewDevice === 'desktop' ? 'bg-[#D4AF37] text-[#08080A]' : 'text-[#8E8EA0]'}`}
                aria-label="Desktop preview"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`p-1.5 rounded ${previewDevice === 'mobile' ? 'bg-[#D4AF37] text-[#08080A]' : 'text-[#8E8EA0]'}`}
                aria-label="Mobile preview"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className={`rounded-xl border border-[#282838] overflow-hidden transition-all duration-200 ${
                previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'
              }`}
              style={{ backgroundColor: accentColor }}
            >
              {/* Preview Header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {logoImage ? (
                    <img
                      src={logoImage}
                      alt={name}
                      className="w-9 h-9 rounded object-cover border border-white/20 shrink-0"
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded flex items-center justify-center text-xs font-bold text-[#08080A] shrink-0"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {logoText || 'VV'}
                    </span>
                  )}
                  <span
                    className="text-sm font-bold text-white truncate"
                    style={{ fontFamily: fontFamily === 'Cinzel' ? 'Cinzel, serif' : 'Plus Jakarta Sans, sans-serif' }}
                  >
                    {name || 'Your Business Name'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-white/75 shrink-0">
                  {enabledModules.ecommerce && <span>Shop</span>}
                  {enabledModules.gallery && <span>Gallery</span>}
                  {enabledModules.bookings && <span>Book</span>}
                </div>
              </div>

              {/* Preview Hero */}
              <div className="relative aspect-[16/9] bg-black/50 overflow-hidden">
                <img
                  src={bannerImage}
                  alt={name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5">
                  <p className="text-[10px] uppercase tracking-wider text-white/80 mb-1">{category}</p>
                  <h3
                    className="text-xl md:text-2xl font-bold text-white mb-1"
                    style={{ fontFamily: fontFamily === 'Cinzel' ? 'Cinzel, serif' : 'Plus Jakarta Sans, sans-serif' }}
                  >
                    {name || 'Your Brand'}
                  </h3>
                  <p className="text-xs text-white/85 max-w-md">{tagline}</p>
                </div>
              </div>

              {/* Preview Body */}
              <div className="p-5 space-y-4">
                <p className="text-xs text-white/75 leading-relaxed">{description}</p>

                {galleryItems.length > 0 && enabledModules.gallery && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-white/85">
                      Gallery Preview ({galleryItems.length} photos)
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {galleryItems.slice(0, 4).map((g) => (
                        <img
                          key={g.id}
                          src={g.url}
                          alt={g.title || 'Preview'}
                          className="aspect-square rounded object-cover border border-white/10"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10 text-xs">
                  <div className="text-white/70 space-y-0.5">
                    <p>{address}</p>
                    <p className="text-[11px] text-white/55">
                      {phone} {businessHours ? `· ${businessHours}` : ''}
                    </p>
                  </div>
                  <span
                    className="px-3.5 py-1.5 rounded font-semibold text-[#08080A]"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {enabledModules.cartCheckout ? 'Shop Catalog' : enabledModules.bookings ? 'Book Now' : 'Enquire'}
                  </span>
                </div>

                {planTier !== 'website_only' && pwaEnabled && (
                  <div className="rounded-lg border border-white/15 bg-black/35 p-3 flex items-center justify-between text-[11px] text-white/85">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                      <span>Installable PWA: {pwaAppName || name} ({(pwaShortName || name).slice(0, 12)})</span>
                    </div>
                    <span className="text-white/60">Web App</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section Order, Custom Navigation Pages, Draft Versions & Publish Control */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Visual Section Order & Pages</h3>
                {editingTenantId && (
                  <button
                    type="button"
                    onClick={handleSaveLayoutAndPages}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#D4AF37] text-[#08080A] font-semibold text-[11px]"
                  >
                    <Save className="w-3 h-3" />
                    <span>Save Layout</span>
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {sectionOrder.map((sec, idx) => (
                  <div key={sec} className="flex items-center justify-between rounded border border-[#1E1E2B] bg-[#09090D] px-3 py-1.5">
                    <span className="capitalize text-[#D5D5E2]">{idx + 1}. {sec} Section</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveSection(idx, -1)} className="p-1 text-[#8E8EA2] hover:text-white" aria-label="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveSection(idx, 1)} className="p-1 text-[#8E8EA2] hover:text-white" aria-label="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#1D1D28] space-y-2">
                <p className="text-[11px] font-semibold text-[#ECC86A]">Custom Navigation Pages ({customPages.length})</p>
                {customPages.map((pg, idx) => (
                  <div key={pg.slug} className="flex items-center justify-between rounded border border-[#1E1E2B] bg-[#09090D] px-2.5 py-1.5">
                    <span className="text-white truncate">{pg.title} <span className="text-[#7E7E92]">/{pg.slug}</span></span>
                    <button
                      type="button"
                      onClick={() => setCustomPages((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-400 hover:text-rose-300"
                      aria-label="Remove page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newPageTitle}
                    onChange={(e) => setNewPageTitle(e.target.value)}
                    placeholder="Page title (e.g. Our Story)"
                    className="flex-1 rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPageTitle.trim()) return;
                      const pgSlug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
                      setCustomPages((prev) => [
                        ...prev,
                        { slug: pgSlug, title: newPageTitle.trim(), content: newPageContent.trim() || `Official ${newPageTitle.trim()} information for ${name}.`, inNav: true },
                      ]);
                      setNewPageTitle('');
                      setNewPageContent('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                <input
                  type="text"
                  value={newPageContent}
                  onChange={(e) => setNewPageContent(e.target.value)}
                  placeholder="Page body text (optional)"
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#D4AF37]" />
                  <span>Draft Snapshots & Publish</span>
                </h3>
                {editingTenantId && (
                  <button
                    type="button"
                    onClick={handleTogglePublish}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                      sitePublished
                        ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-900/50 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {sitePublished ? 'Published' : 'Draft'}
                  </button>
                )}
              </div>

              {!editingTenantId ? (
                <p className="text-[11px] text-[#8E8EA2]">
                  Publish your website first (or select an existing business above) to save draft snapshots, restore previous versions, or switch between Published and Draft.
                </p>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      placeholder="Snapshot note (e.g. Festive Theme)"
                      className="flex-1 rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white"
                    />
                    <button
                      type="button"
                      disabled={savingVersion}
                      onClick={handleSaveDraftSnapshot}
                      className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold whitespace-nowrap"
                    >
                      {savingVersion ? 'Saving...' : 'Save Draft'}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {versions.length === 0 ? (
                      <p className="text-[11px] text-[#8E8EA2]">No saved version snapshots yet.</p>
                    ) : (
                      versions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between rounded border border-[#1E1E2B] bg-[#09090D] px-2.5 py-2">
                          <div>
                            <p className="text-white font-medium">v{v.versionNumber} · {v.label}</p>
                            <p className="text-[10px] text-[#8E8EA2]">{new Date(v.createdAt).toLocaleString('en-IN')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRestoreVersion(v.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#D4AF37]/40 text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A]"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Package Purchase & Publish Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-xl border border-[#2B2B3E] bg-[#0E0E15] p-6 text-xs text-[#E4E4EE] shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => !checkoutBusy && setPublishModalOpen(false)}
              disabled={checkoutBusy}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-1.5 rounded-md text-[#8E8EA2] hover:text-white hover:bg-[#1A1A26] transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="font-luxury text-lg font-bold text-white">Activate Package &amp; Publish Website</h2>
            </div>
            <p className="text-[#9E9EB2] text-[11px] mb-4">
              Your website is saved as a secure draft. To publish live to the public at your custom URL, activate your Business Website package.
            </p>

            {/* Selected Package Details */}
            {(() => {
              const cur = PLAN_TIER_CONFIG[planTier] || PLAN_TIER_CONFIG.website_only;
              return (
                <div className="rounded-lg border border-[#232332] bg-[#12121B] p-4 mb-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#D4AF37]/20 text-[#ECC86A] mb-1">
                        ACTIVE SELECTION
                      </span>
                      <h3 className="font-luxury text-base font-bold text-white">{cur.name}</h3>
                      <p className="text-[11px] text-[#A2A2B6]">Publishing target: /site/{slug}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono-tabular text-xl font-bold text-[#ECC86A]">{cur.baseStr}</p>
                      <p className="text-[10px] text-[#7A7A8E]">+ 18% GST</p>
                    </div>
                  </div>

                  {/* Price Calculation Breakdown */}
                  <div className="border-t border-[#1E1E2C] pt-2.5 space-y-1.5 font-mono-tabular text-[11px]">
                    <div className="flex justify-between text-[#A0A0B4]">
                      <span>Package Base Price:</span>
                      <span>{cur.baseStr}</span>
                    </div>
                    <div className="flex justify-between text-[#A0A0B4]">
                      <span>GST (18% Goods &amp; Services Tax):</span>
                      <span>{cur.gstStr}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-[#1E1E2C]">
                      <span>Total Amount Payable:</span>
                      <span className="text-[#ECC86A]">{cur.totalStr}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Package Boundaries & Ownership Disclosures */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 mb-4 text-[10px] text-[#C4B79A] leading-relaxed space-y-1">
              <p className="font-semibold text-amber-300">Package Scope &amp; Responsibilities:</p>
              <p>• <strong>Custom Domain:</strong> Customer owns their domain (e.g. from Cloudflare, GoDaddy). Registration &amp; renewal fees are paid directly to your registrar.</p>
              <p>• <strong>Hosting:</strong> Cloudflare edge hosting is provided under platform arrangements.</p>
              <p>• <strong>Payment Gateway:</strong> Seller website payments flow directly to your own separately linked merchant account.</p>
              <p>• <strong>Tenant Isolation:</strong> You receive exclusive management access to your website. No access to other tenants or platform admin controls.</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handlePurchaseAndPublish}
                disabled={checkoutBusy}
                className="w-full py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
              >
                {checkoutBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying with Razorpay...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>
                      Pay via Razorpay &amp; Publish (
                      {(PLAN_TIER_CONFIG[planTier] || PLAN_TIER_CONFIG.website_only).totalStr}
                      )
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                disabled={checkoutBusy}
                className="w-full py-2 rounded-md border border-[#2B2B3C] text-[11px] font-medium text-[#A0A0B2] hover:text-white transition-colors"
              >
                Keep Saved as Unpublished Draft
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Customer Logo Studio Modal */}
      {logoStudioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl">
            <button
              type="button"
              onClick={() => setLogoStudioOpen(false)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-md text-[#8E8EA2] hover:text-white bg-[#1A1A26] border border-[#2B2B3C]"
              aria-label="Close Logo Studio"
            >
              <X className="w-4 h-4" />
            </button>
            <CustomerLogoCustomizer
              tenantId={slug}
              tenantName={name}
              currentLogo={{
                type: logoImage ? 'image' : 'text',
                imageUrl: logoImage,
                initials: logoText,
                businessName: name,
              }}
              onSaveLogo={(cfg) => {
                if (cfg.type === 'image' && cfg.imageUrl) {
                  setLogoImage(cfg.imageUrl);
                } else {
                  setLogoImage('');
                  setLogoText(cfg.initials || 'VV');
                }
                setLogoStudioOpen(false);
                onNotify('Logo customized and updated in website draft!');
              }}
              onNotify={onNotify}
            />
          </div>
        </div>
      )}
    </div>
  );
};
