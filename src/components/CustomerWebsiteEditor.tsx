// ============================================================================
// src/components/CustomerWebsiteEditor.tsx
// Module 6: Real Customer Self-Editing Suite After Website Publication
// Enables authenticated business owners to customize branding, copy, contact info,
// typography, colors, banners, and active store modules with draft saving, version
// snapshots, one-click live publishing, and real-time desktop/mobile preview.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Layout,
  Loader2,
  MapPin,
  MessageCircle,
  Monitor,
  Palette,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  Type,
  Upload,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TenantModules, TenantRecord } from '../types/platform';
import { BUSINESS_CATEGORIES } from '../data/content';

import diningBanner from '../assets/images/store_gourmet_dining_1795055802368.jpg';
import fashionBanner from '../assets/images/store_fashion_royal_1795055802960.jpg';
import groceryBanner from '../assets/images/store_grocery_organic_1795055803860.jpg';
import electronicsBanner from '../assets/images/store_electronics_audio_1795055804216.jpg';
import studioBanner from '../assets/images/hero_vijay_studio_1795055804014.jpg';

const BANNER_PRESETS = [
  { label: 'Fine Dining & Food', url: diningBanner },
  { label: 'Luxury Fashion & Silk', url: fashionBanner },
  { label: 'Grocery & Organic Mart', url: groceryBanner },
  { label: 'Electronics & Audio', url: electronicsBanner },
  { label: 'Creative Studio & Media', url: studioBanner },
];

const LUXURY_PALETTES = [
  { name: 'Royal Gold & Dark Obsidian', primary: '#D4AF37', accent: '#0D0D12' },
  { name: 'Imperial Amber & Navy', primary: '#ECC86A', accent: '#0B1E3B' },
  { name: 'Emerald Heritage & Slate', primary: '#10B981', accent: '#061A14' },
  { name: 'Ruby Silk & Charcoal', primary: '#E11D48', accent: '#18070B' },
  { name: 'Modern Sapphire & Black', primary: '#3B82F6', accent: '#090D1A' },
  { name: 'Minimalist Monochrome', primary: '#FFFFFF', accent: '#121217' },
];

const FONT_CHOICES = [
  { id: 'Cinzel', label: 'Cinzel (Editorial / Luxury Classic)', preview: 'Luxury Serif' },
  { id: 'Inter', label: 'Inter (Clean & Modern Sans-Serif)', preview: 'Modern Sans' },
  { id: 'Montserrat', label: 'Montserrat (Geometric & Bold)', preview: 'Geometric Sans' },
  { id: 'Playfair Display', label: 'Playfair Display (Boutique Serif)', preview: 'High-Fashion' },
  { id: 'Cormorant Garamond', label: 'Cormorant Garamond (Artisanal Elegance)', preview: 'Heritage Serif' },
];

interface VersionRecord {
  id: number;
  versionNumber: number;
  label: string;
  createdAt: string;
}

interface CustomerWebsiteEditorProps {
  tenant: TenantRecord;
  onRefreshTenant: () => void;
  onOpenStorefront: (slug: string) => void;
  onGoBuilder: (tenantId?: number) => void;
  onNotify: (msg: string) => void;
}

export const CustomerWebsiteEditor: React.FC<CustomerWebsiteEditorProps> = ({
  tenant,
  onRefreshTenant,
  onOpenStorefront,
  onGoBuilder,
  onNotify,
}) => {
  // Active edit tabs
  const [activeTab, setActiveTab] = useState<'info' | 'branding' | 'hero' | 'modules' | 'history'>('info');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Form State
  const [name, setName] = useState(tenant.name || '');
  const [tagline, setTagline] = useState(tenant.tagline || '');
  const [category, setCategory] = useState(tenant.category || 'General Business');
  const [description, setDescription] = useState(tenant.description || '');
  const [phone, setPhone] = useState(tenant.phone || '');
  const [whatsapp, setWhatsapp] = useState(tenant.whatsapp || '');
  const [address, setAddress] = useState(tenant.address || '');
  const [businessHours, setBusinessHours] = useState(tenant.businessHours || 'Mon - Sun: 9:00 AM - 10:00 PM');

  // Branding State
  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor || '#D4AF37');
  const [accentColor, setAccentColor] = useState(tenant.accentColor || '#0D0D12');
  const [fontFamily, setFontFamily] = useState(tenant.fontFamily || 'Cinzel');
  const [bannerImage, setBannerImage] = useState(tenant.bannerImage || diningBanner);
  const [customBannerUrl, setCustomBannerUrl] = useState('');

  // Hero Copy State
  const [heroHeadline, setHeroHeadline] = useState(tenant.name || '');
  const [heroSubheadline, setHeroSubheadline] = useState(
    tenant.tagline || 'Experience handcrafted excellence & authentic service.'
  );
  const [ctaText, setCtaText] = useState('Explore Catalog');

  // Modules State
  const [modules, setModules] = useState<TenantModules>(
    tenant.enabledModules || {
      ecommerce: true,
      cartCheckout: true,
      gallery: true,
      bookings: false,
      whatsappOrder: true,
      reviews: true,
      wishlist: true,
      coupons: true,
      wholesale: false,
    }
  );

  // Version Snapshots State
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  // Sync state if tenant changes externally
  useEffect(() => {
    setName(tenant.name || '');
    setTagline(tenant.tagline || '');
    setCategory(tenant.category || 'General Business');
    setDescription(tenant.description || '');
    setPhone(tenant.phone || '');
    setWhatsapp(tenant.whatsapp || '');
    setAddress(tenant.address || '');
    setBusinessHours(tenant.businessHours || 'Mon - Sun: 9:00 AM - 10:00 PM');
    setPrimaryColor(tenant.primaryColor || '#D4AF37');
    setAccentColor(tenant.accentColor || '#0D0D12');
    setFontFamily(tenant.fontFamily || 'Cinzel');
    setBannerImage(tenant.bannerImage || diningBanner);
    if (tenant.enabledModules) setModules(tenant.enabledModules);
  }, [tenant]);

  // Load Saved Version Snapshots
  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const res = await apiFetch<{ versions: VersionRecord[] }>(`/api/owner/tenants/${tenant.id}/versions`);
      setVersions(res.versions || []);
    } catch {
      // non-fatal
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [tenant.id]);

  // 1. Save Changes as a Safe Draft Version Snapshot
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          label: `Draft Snapshot — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        }),
      });
      await loadVersions();
      onNotify('Draft snapshot created with rollback protection.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save draft snapshot.');
    } finally {
      setSavingDraft(false);
    }
  };

  // 2. Publish Changes to Live Website
  const handlePublishLive = async () => {
    setPublishing(true);
    try {
      const payload = {
        name: name.trim() || tenant.name,
        tagline: tagline.trim(),
        category,
        description: description.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim(),
        address: address.trim(),
        businessHours: businessHours.trim(),
        primaryColor,
        accentColor,
        fontFamily,
        bannerImage: customBannerUrl.trim() || bannerImage,
        enabledModules: modules,
        published: true,
      };

      await apiFetch(`/api/tenants/${tenant.slug}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      // Also create an automatic post-publish snapshot
      try {
        await apiFetch(`/api/owner/tenants/${tenant.id}/versions`, {
          method: 'POST',
          body: JSON.stringify({ label: `Published Live — ${new Date().toLocaleDateString()}` }),
        });
      } catch {}

      await loadVersions();
      onRefreshTenant();
      onNotify(`Website updates published live! Accessible at /site/${tenant.slug}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to publish website changes.');
    } finally {
      setPublishing(false);
    }
  };

  // 3. Rollback to a Previous Version Snapshot
  const handleRestoreVersion = async (vId: number) => {
    if (!window.confirm('Restore website configuration from this snapshot? Current unsaved changes will be replaced.')) {
      return;
    }
    setRestoringId(vId);
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/versions/${vId}/restore`, {
        method: 'POST',
      });
      onRefreshTenant();
      await loadVersions();
      onNotify('Website successfully restored from historical snapshot!');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to restore version.');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="rounded-2xl border border-[#2B2B3C] bg-[#0E0E14] p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1E1E2C]">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-luxury font-black text-lg border shadow-md"
              style={{
                backgroundColor: accentColor,
                color: primaryColor,
                borderColor: `${primaryColor}40`,
              }}
            >
              {tenant.logoText || (name ? name.slice(0, 2).toUpperCase() : 'VV')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-luxury">{name || tenant.name}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Customer Self-Editing Active
                </span>
              </div>
              <p className="text-xs text-[#9A9AB0] flex items-center gap-1.5 mt-0.5">
                <Globe className="w-3.5 h-3.5 text-[#ECC86A]" />
                <span>Live URL:</span>
                <span className="font-mono text-[#ECC86A]">/site/{tenant.slug}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenStorefront(tenant.slug)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A3C] bg-[#14141E] text-xs text-[#D0D0E2] hover:text-white hover:border-[#D4AF37] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Storefront</span>
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D4AF37]/40 text-[#ECC86A] text-xs font-semibold hover:bg-[#D4AF37]/10 transition-colors disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
            </button>
            <button
              type="button"
              onClick={handlePublishLive}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity shadow-md disabled:opacity-60"
            >
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{publishing ? 'Publishing Changes...' : 'Publish Live to Website'}</span>
            </button>
            <button
              type="button"
              onClick={() => onGoBuilder(tenant.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-500/40 text-purple-300 bg-purple-950/20 text-xs font-semibold hover:bg-purple-950/40 transition-colors"
              title="Open full drag & drop section builder"
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Full Visual Builder</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-3">
          {[
            { id: 'info', label: '1. Business Info & Contact', icon: Globe },
            { id: 'branding', label: '2. Colors & Typography', icon: Palette },
            { id: 'hero', label: '3. Hero Banner & Copy', icon: ImageIcon },
            { id: 'modules', label: '4. Active Store Modules', icon: Layers },
            { id: 'history', label: '5. Version History & Rollback', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#D4AF37] text-[#08080A] shadow-md'
                    : 'bg-[#12121C] text-[#A0A0B5] hover:text-white hover:bg-[#1A1A26]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Body: Editor Controls + Live Responsive Device Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Config Panels (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* TAB 1: BUSINESS INFO & CONTACT */}
          {activeTab === 'info' && (
            <div className="rounded-2xl border border-[#232332] bg-[#0D0D14] p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#D4AF37]" />
                <span>Business Identification & Location</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Business Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. Royal Feast Cloud Kitchen"
                  />
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Industry Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.label}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-[#A5A5B8] mb-1 font-medium">Tagline / Brand Promise</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  placeholder="e.g. Handcrafted Authentic Hyderabadi Biryani & Dum Specialities"
                />
              </div>

              <div className="text-xs">
                <label className="block text-[#A5A5B8] mb-1 font-medium">About Your Business</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none resize-none"
                  placeholder="Share your heritage, culinary passion, or business mission..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-[#1F1F2D]">
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Customer Call Phone</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WhatsApp Order Number</span>
                  </label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>Store / Kitchen Address</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                    placeholder="e.g. Jubilee Hills Road No. 36, Hyderabad"
                  />
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Operating Hours</span>
                  </label>
                  <input
                    type="text"
                    value={businessHours}
                    onChange={(e) => setBusinessHours(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                    placeholder="Mon - Sun: 11:00 AM - 11:00 PM"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BRANDING & TYPOGRAPHY */}
          {activeTab === 'branding' && (
            <div className="rounded-2xl border border-[#232332] bg-[#0D0D14] p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#D4AF37]" />
                <span>Luxury Brand Colors & Font Family</span>
              </h3>

              {/* Curated Luxury Palettes */}
              <div>
                <label className="block text-xs text-[#A5A5B8] mb-2 font-medium">Curated Luxury Color Schemes</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LUXURY_PALETTES.map((pal) => (
                    <button
                      key={pal.name}
                      type="button"
                      onClick={() => {
                        setPrimaryColor(pal.primary);
                        setAccentColor(pal.accent);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        primaryColor === pal.primary && accentColor === pal.accent
                          ? 'border-[#D4AF37] bg-[#16130B] ring-1 ring-[#D4AF37]'
                          : 'border-[#222230] bg-[#09090D] hover:border-[#38384C]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-4 h-4 rounded-full border border-black/30" style={{ backgroundColor: pal.primary }} />
                        <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: pal.accent }} />
                      </div>
                      <p className="text-[11px] font-semibold text-white truncate">{pal.name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Hex Pickers */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#1F1F2D]">
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Primary Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded border border-[#2C2C3C] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-1.5 font-mono text-xs text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Dark Surface / Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded border border-[#2C2C3C] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-1.5 font-mono text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Typography / Font Pairings */}
              <div className="pt-2 border-t border-[#1F1F2D]">
                <label className="block text-xs text-[#A5A5B8] mb-2 font-medium flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#ECC86A]" />
                  <span>Storefront Font Family</span>
                </label>
                <div className="space-y-2">
                  {FONT_CHOICES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFontFamily(f.id)}
                      className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors ${
                        fontFamily === f.id
                          ? 'border-[#D4AF37] bg-[#16130B] text-white'
                          : 'border-[#222230] bg-[#09090D] text-[#A0A0B2] hover:border-[#38384C]'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold text-white">{f.label}</span>
                        <p className="text-[10px] text-[#7A7A90]" style={{ fontFamily: f.id }}>
                          Preview: The quick brown fox jumps over the lazy dog.
                        </p>
                      </div>
                      {fontFamily === f.id && <Check className="w-4 h-4 text-[#D4AF37]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HERO BANNER & COPY */}
          {activeTab === 'hero' && (
            <div className="rounded-2xl border border-[#232332] bg-[#0D0D14] p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
                <span>Storefront Hero Banner & Catchphrases</span>
              </h3>

              {/* Hero Banner Presets */}
              <div>
                <label className="block text-xs text-[#A5A5B8] mb-2 font-medium">Select Industry Hero Banner</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BANNER_PRESETS.map((bp) => (
                    <button
                      key={bp.label}
                      type="button"
                      onClick={() => {
                        setBannerImage(bp.url);
                        setCustomBannerUrl('');
                      }}
                      className={`relative rounded-xl overflow-hidden border aspect-video group transition-all ${
                        bannerImage === bp.url && !customBannerUrl
                          ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/50 shadow-md'
                          : 'border-[#262638] opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={bp.url} alt={bp.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/50 p-2 flex items-end">
                        <span className="text-[10px] font-semibold text-white truncate drop-shadow">{bp.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Image URL */}
              <div className="text-xs pt-2 border-t border-[#1F1F2D]">
                <label className="block text-[#A5A5B8] mb-1 font-medium">Or Custom Banner Image URL (HTTPS)</label>
                <input
                  type="url"
                  value={customBannerUrl}
                  onChange={(e) => setCustomBannerUrl(e.target.value)}
                  placeholder="https://example.com/your-custom-high-res-banner.jpg"
                  className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Hero Headline & CTA */}
              <div className="space-y-3 pt-2 border-t border-[#1F1F2D] text-xs">
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Hero Main Headline</label>
                  <input
                    type="text"
                    value={heroHeadline}
                    onChange={(e) => setHeroHeadline(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Hero Subheadline</label>
                  <input
                    type="text"
                    value={heroSubheadline}
                    onChange={(e) => setHeroSubheadline(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A5A5B8] mb-1 font-medium">Primary Call-to-Action (CTA) Button Text</label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="w-full rounded-lg border border-[#28283A] bg-[#07070B] px-3 py-2 text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVE STORE MODULES */}
          {activeTab === 'modules' && (
            <div className="rounded-2xl border border-[#232332] bg-[#0D0D14] p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#D4AF37]" />
                <span>Enable or Disable Storefront Features</span>
              </h3>
              <p className="text-xs text-[#9E9EB0]">
                Turn on only the capabilities your business needs. Changes take effect on your live storefront upon publishing.
              </p>

              <div className="space-y-2 text-xs">
                {[
                  { key: 'ecommerce', label: 'E-Commerce Storefront & Instant Cart', desc: 'Allow visitors to browse catalog and add items to a slide-over cart drawer' },
                  { key: 'cartCheckout', label: 'Online Checkout & Payment Gateways', desc: 'Accept direct UPI, Cashfree cards/netbanking, and Cash on Delivery' },
                  { key: 'whatsappOrder', label: 'WhatsApp One-Click Direct Ordering', desc: 'Send order items and customer delivery location straight to merchant WhatsApp' },
                  { key: 'bookings', label: 'Table Reservations & Service Bookings', desc: 'Allow visitors to schedule consultation, table, or appointment time slots' },
                  { key: 'gallery', label: 'Photo & Portfolio Showcase Gallery', desc: 'Display categorized images, dishes, interior ambiance, or client work' },
                  { key: 'reviews', label: 'Customer Reviews & Star Ratings', desc: 'Display verified buyer testimonials with merchant reply capabilities' },
                  { key: 'wishlist', label: 'Saved Wishlist Favorites', desc: 'Allow customers to save products to their private wishlist' },
                  { key: 'coupons', label: 'Discount Coupons & Promo Codes', desc: 'Allow buyers to apply percentage or flat discount coupon codes at checkout' },
                ].map((item) => {
                  const isChecked = Boolean(modules[item.key as keyof TenantModules]);
                  return (
                    <label
                      key={item.key}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        isChecked ? 'border-[#D4AF37]/50 bg-[#14120A]' : 'border-[#222230] bg-[#08080C]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setModules({ ...modules, [item.key]: e.target.checked })
                        }
                        className="mt-0.5 rounded border-[#38384A] bg-[#09090D] text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <div>
                        <span className="font-semibold text-white">{item.label}</span>
                        <p className="text-[11px] text-[#8E8EA2] mt-0.5">{item.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: VERSION HISTORY & ROLLBACK */}
          {activeTab === 'history' && (
            <div className="rounded-2xl border border-[#232332] bg-[#0D0D14] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-[#D4AF37]" />
                  <span>Historical Snapshots & Rollback Protection</span>
                </h3>
                <button
                  type="button"
                  onClick={loadVersions}
                  disabled={loadingVersions}
                  className="inline-flex items-center gap-1 text-xs text-[#ECC86A] hover:underline"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingVersions ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <p className="text-xs text-[#9E9EB0]">
                Every time you publish or create a draft snapshot, a backup is created. You can restore your website to any previous configuration with one click.
              </p>

              {versions.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[#242436] text-center text-xs text-[#7A7A8E]">
                  No historical snapshots saved yet. Click "Save Draft" or "Publish Live" to record your first snapshot.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {versions.map((ver) => (
                    <div
                      key={ver.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-[#222230] bg-[#09090D] text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white flex items-center gap-2">
                          <span>Version #{ver.versionNumber}</span>
                          <span className="text-[10px] text-[#D4AF37] px-2 py-0.5 rounded bg-[#D4AF37]/10 font-normal">
                            {ver.label}
                          </span>
                        </p>
                        <p className="text-[10px] text-[#7E7E92] mt-0.5">
                          {ver.createdAt ? new Date(ver.createdAt).toLocaleString() : 'Recent Snapshot'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreVersion(ver.id)}
                        disabled={restoringId === ver.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50 text-[11px] font-semibold"
                      >
                        {restoringId === ver.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Rollback to This</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Live Responsive Visual Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3 sticky top-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[#ECC86A]" />
              <span>Real-Time Storefront Preview</span>
            </span>
            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#14141E] border border-[#242436]">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`p-1.5 rounded text-xs transition-colors ${
                  previewDevice === 'desktop' ? 'bg-[#D4AF37] text-[#08080A]' : 'text-[#8E8EA2] hover:text-white'
                }`}
                title="Desktop View (100%)"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`p-1.5 rounded text-xs transition-colors ${
                  previewDevice === 'mobile' ? 'bg-[#D4AF37] text-[#08080A]' : 'text-[#8E8EA2] hover:text-white'
                }`}
                title="Mobile View (375px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Device Frame */}
          <div
            className={`mx-auto rounded-2xl border border-[#2C2C3E] bg-[#060608] shadow-2xl overflow-hidden transition-all duration-300 ${
              previewDevice === 'mobile' ? 'max-w-[340px]' : 'w-full'
            }`}
          >
            {/* Mock Browser Topbar */}
            <div className="px-3 py-2 bg-[#0C0C12] border-b border-[#1E1E2C] flex items-center justify-between text-[10px] text-[#7A7A8E]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500/80" />
                <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
              </div>
              <div className="truncate px-2 font-mono text-[9px] text-[#A0A0B2] bg-[#14141E] rounded">
                vijayvisuals.in/site/{tenant.slug}
              </div>
              <span className="text-[9px] text-emerald-400">● Live</span>
            </div>

            {/* Storefront Mini Preview */}
            <div className="relative overflow-hidden" style={{ fontFamily }}>
              {/* Hero Banner */}
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={customBannerUrl.trim() || bannerImage}
                  alt={name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060608] via-black/40 to-black/20" />

                {/* Hero Badge & Monogram */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-luxury font-black text-xs border shadow"
                    style={{
                      backgroundColor: accentColor,
                      color: primaryColor,
                      borderColor: `${primaryColor}60`,
                    }}
                  >
                    {tenant.logoText || (name ? name.slice(0, 2).toUpperCase() : 'VV')}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-tight drop-shadow">{name}</p>
                    <p className="text-[8px] text-[#ECC86A]">{category}</p>
                  </div>
                </div>

                {/* Hero Content */}
                <div className="absolute bottom-3 left-3 right-3">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[8px] font-semibold mb-1 uppercase tracking-wider"
                    style={{ backgroundColor: `${primaryColor}25`, color: primaryColor }}
                  >
                    {category}
                  </span>
                  <h4 className="text-sm font-bold text-white drop-shadow leading-tight line-clamp-1">
                    {heroHeadline || name}
                  </h4>
                  <p className="text-[10px] text-[#D5D5E4] drop-shadow line-clamp-1 mt-0.5">
                    {heroSubheadline}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded text-[10px] font-bold shadow"
                      style={{ backgroundColor: primaryColor, color: accentColor }}
                    >
                      {ctaText}
                    </button>
                    {modules.whatsappOrder && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
                        <MessageCircle className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Modules Badges */}
              <div className="p-3 bg-[#0A0A0E] border-t border-[#1C1C28] space-y-2">
                <div className="flex items-center justify-between text-[10px] text-[#8E8EA2]">
                  <span>Active Features:</span>
                  <span className="text-[#ECC86A]">
                    {Object.values(modules).filter(Boolean).length} Enabled
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {modules.ecommerce && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      Cart & Storefront
                    </span>
                  )}
                  {modules.cartCheckout && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      UPI / Cashfree
                    </span>
                  )}
                  {modules.whatsappOrder && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      WhatsApp Orders
                    </span>
                  )}
                  {modules.bookings && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      Bookings
                    </span>
                  )}
                  {modules.gallery && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      Gallery
                    </span>
                  )}
                  {modules.reviews && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
                      Reviews
                    </span>
                  )}
                </div>

                {/* Footer preview */}
                <div className="pt-2 border-t border-[#161622] text-[9px] text-[#7A7A8E] space-y-0.5">
                  <p className="truncate">📍 {address || 'Store location'}</p>
                  <p className="truncate">📞 {phone || 'Contact phone'}</p>
                  <p className="truncate">⏰ {businessHours || 'Operating hours'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 text-[11px] text-[#B8C8B8] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Changes made here update your Cloudflare D1 website publication directly without staff intervention.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
