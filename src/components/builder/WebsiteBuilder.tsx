import React, { useState } from 'react';
import {
  TEMPLATES_DATA,
  BusinessTemplate,
  BusinessTenant,
  businessService,
  orderService,
  UserProfile,
  Order
} from '../../lib/supabase';
import { AiStudioSection } from '../ai/AiStudioSection';
import { AiWebsiteResult } from '../../lib/aiService';
import {
  Sparkles,
  Globe,
  ShoppingBag,
  Calendar,
  MessageCircle,
  MapPin,
  ExternalLink,
  Check,
  Eye,
  Smartphone,
  Monitor,
  Palette,
  Type,
  Share2,
  Plus,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Languages,
  Clock,
  Phone,
  Mail,
  Bot,
  Wand2
} from 'lucide-react';

interface WebsiteBuilderProps {
  currentUser?: UserProfile | null;
  onShowToast: (msg: string) => void;
  onOpenStorefrontModal?: (business: BusinessTenant) => void;
}

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({
  currentUser,
  onShowToast,
  onOpenStorefrontModal,
}) => {
  const [builderView, setBuilderView] = useState<'editor' | 'ai_studio'>('editor');
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessTemplate>(TEMPLATES_DATA[0]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [previewLanguage, setPreviewLanguage] = useState<'en' | 'te' | 'hi'>('en');
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');

  // Customization state
  const [businessName, setBusinessName] = useState('Royal Feast Cloud Kitchen');
  const [tagline, setTagline] = useState('Authentic Hyderabadi Dum Biryani & Kebabs');
  const [city, setCity] = useState('Hyderabad');
  const [phone, setPhone] = useState('+91 93813 62201');
  const [whatsapp, setWhatsapp] = useState('919381362201');
  const [themeColor, setThemeColor] = useState('#DFBA5A');
  const [fontFamily, setFontFamily] = useState('Cinzel');

  // E-commerce Cart simulation inside the live preview
  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([
    { id: '1', name: 'Signature Dum Biryani Special', price: 650, qty: 1 }
  ]);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutName, setCheckoutName] = useState('Pooja Reddy');
  const [checkoutPhone, setCheckoutPhone] = useState('+91 97011 88990');
  const [checkoutAddress, setCheckoutAddress] = useState('Plot 42, Hitec City, Hyderabad');
  const [checkoutPayment, setCheckoutPayment] = useState<'cod' | 'upi'>('upi');

  // Booking Modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingDate, setBookingDate] = useState('2026-11-15');
  const [bookingTime, setBookingTime] = useState('11:00 AM');
  const [bookingService, setBookingService] = useState('VIP Table / Consultation Slot');

  // Unique Subdomain
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const liveUrl = `https://${slug || 'my-shop'}.vijayvisuals.com`;

  // Categories list
  const categories = ['all', ...Array.from(new Set(TEMPLATES_DATA.map((t) => t.category)))];

  const filteredTemplates = activeCategory === 'all'
    ? TEMPLATES_DATA
    : TEMPLATES_DATA.filter((t) => t.category === activeCategory);

  const handlePublishWebsite = () => {
    const newBiz: BusinessTenant = {
      id: 'biz-' + Date.now().toString(36),
      owner_id: currentUser ? currentUser.id : 'usr-shop-01',
      business_name: businessName,
      slug: slug || 'my-shop',
      category: selectedTemplate.category,
      tagline: tagline,
      phone: phone,
      whatsapp: whatsapp,
      email: 'owner@' + (slug || 'myshop') + '.com',
      address: 'Shop No 14, Main Road, ' + city,
      city: city,
      theme_color: themeColor,
      font_family: fontFamily,
      language: previewLanguage,
      status: 'active',
      subdomain: `${slug || 'my-shop'}.vijayvisuals.com`,
      created_at: new Date().toISOString(),
    };

    businessService.saveBusiness(newBiz);
    onShowToast(`Website published successfully at: ${liveUrl}`);
  };

  const addToCart = (name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.name === name);
      if (existing) {
        return prev.map((i) => (i.name === name ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: Date.now().toString(), name, price, qty: 1 }];
    });
    onShowToast(`Added "${name}" to shopping cart!`);
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutName || !checkoutAddress) return;

    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    const createdOrder = orderService.createOrder({
      business_id: 'biz-01',
      business_name: businessName,
      customer_name: checkoutName,
      customer_phone: checkoutPhone,
      delivery_address: checkoutAddress,
      delivery_city: city,
      items: cart.map((c) => ({ id: c.id, name: c.name, quantity: c.qty, price: c.price })),
      total_amount: total,
      payment_method: checkoutPayment,
      payment_status: checkoutPayment === 'upi' ? 'paid' : 'pending',
      order_status: 'placed',
      delivery_notes: 'Placed via Vijay Visuals Multi-Tenant Customer Storefront.',
    });

    onShowToast(`Order placed successfully! Order ID: ${createdOrder.order_number}`);
    setShowCheckoutModal(false);
    setCart([]);
  };

  // Translations dictionary for the 3 requested languages
  const t = {
    en: {
      orderNow: 'Order Now',
      bookAppointment: 'Book Appointment',
      aboutUs: 'About Our Business',
      whatsappEnquiry: 'WhatsApp Enquiry',
      directions: 'Get Directions (Google Maps)',
      cartTitle: 'Store Cart',
      checkout: 'Proceed to Checkout',
      menuHeader: 'Curated Catalog & Services',
      contactTitle: 'Visit or Contact Us',
      deliveryInfo: 'Express Delivery Available Across',
    },
    te: {
      orderNow: 'ఇప్పుడే ఆర్డర్ చేయండి',
      bookAppointment: 'అపాయింట్‌మెంట్ బుక్ చేయండి',
      aboutUs: 'మా గురించి & మా సేవలు',
      whatsappEnquiry: 'వాట్సాప్ ఎంక్వైరీ',
      directions: 'గూగుల్ మ్యాప్స్ దిశలు',
      cartTitle: 'షాపింగ్ కార్ట్',
      checkout: 'ఆర్డర్ పూర్తి చేయండి',
      menuHeader: 'ప్రత్యేక ఉత్పత్తులు & సేవలు',
      contactTitle: 'మమ్మల్ని సంప్రదించండి',
      deliveryInfo: 'వేగవంతమైన డెలివరీ అందుబాటులో ఉంది',
    },
    hi: {
      orderNow: 'अभी ऑर्डर करें',
      bookAppointment: 'अपॉइंटमेंट बुक करें',
      aboutUs: 'हमारे बारे में',
      whatsappEnquiry: 'व्हाट्सएप पूछताछ',
      directions: 'गूगल मैप्स रास्ता देखें',
      cartTitle: 'शॉपिंग कार्ट',
      checkout: 'चेकआउट करें',
      menuHeader: 'उत्कृष्ट उत्पाद एवं सेवाएं',
      contactTitle: 'हमसे संपर्क करें',
      deliveryInfo: 'सुपरफाస్ట్ डिलीवरी उपलब्ध है',
    }
  }[previewLanguage];

  const handleApplyAiPlan = (plan: AiWebsiteResult) => {
    if (plan.heroTitle) setBusinessName(plan.heroTitle);
    if (plan.tagline) setTagline(plan.tagline);
    if (plan.suggestedThemeColor) setThemeColor(plan.suggestedThemeColor);
    if (plan.suggestedFont) setFontFamily(plan.suggestedFont);
    if (plan.productsOrServices?.length) {
      const parsedPrice = parseInt(plan.productsOrServices[0].price.replace(/[^0-9]/g, '')) || 499;
      setCart([
        { id: 'ai-1', name: plan.productsOrServices[0].name, price: parsedPrice, qty: 1 }
      ]);
    }
    setBuilderView('editor');
    onShowToast('Applied AI Website Blueprint to live editor! Check your live preview.');
  };

  return (
    <div className="py-12 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
      
      {/* Builder Top Banner */}
      <div className="bg-[#0E0E15] border border-[#262638] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A]">
            <Sparkles className="w-4 h-4" />
            <span>Vijay Visuals Multi-Tenant Builder & AI Suite</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#8E8EA0]">20+ Localized Templates</span>
          </div>

          <h2 className="font-luxury text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
            Launch Your High-End Business Website in Minutes.
          </h2>

          <p className="text-[#9E9EAF] text-sm sm:text-base leading-relaxed">
            Choose from 20+ authentic industry categories, customize your branding, leverage 7 neural AI tools, select Telugu (తెలుగు), English or Hindi (హిन्दी), and publish with a unique domain and direct WhatsApp & Delivery Boy integration.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handlePublishWebsite}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow-md shadow-[#D4AF37]/20"
            >
              <Globe className="w-4 h-4" />
              <span>Publish Business Website</span>
            </button>

            <button
              onClick={() => setBuilderView(builderView === 'ai_studio' ? 'editor' : 'ai_studio')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#181826] hover:bg-[#202034] text-xs font-semibold text-[#DFBA5A] border border-[#DFBA5A]/50"
            >
              <Wand2 className="w-4 h-4" />
              <span>{builderView === 'ai_studio' ? 'Back to Visual Editor' : 'Open AI Studio (7 AI Features)'}</span>
            </button>

            <span className="text-xs font-mono text-[#DFBA5A] px-3 py-2 rounded bg-[#13131E] border border-[#212130]">
              Unique URL: {liveUrl}
            </span>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1E1E2C]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBuilderView('editor')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              builderView === 'editor'
                ? 'bg-[#181826] text-[#DFBA5A] border border-[#DFBA5A]/50 shadow'
                : 'text-[#848496] hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Visual Customizer & Live Storefront</span>
          </button>

          <button
            onClick={() => setBuilderView('ai_studio')}
            className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              builderView === 'ai_studio'
                ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] font-bold shadow-md shadow-[#D4AF37]/20'
                : 'text-[#DFBA5A] bg-[#141420] border border-[#242436] hover:bg-[#1C1C2C]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Neural Studio (7 AI Features)</span>
          </button>
        </div>
      </div>

      {/* CONDITIONAL RENDER: AI STUDIO SECTION */}
      {builderView === 'ai_studio' ? (
        <AiStudioSection
          tenantId={currentUser ? currentUser.id : 'biz-01'}
          businessName={businessName}
          category={selectedTemplate.category}
          city={city}
          onApplyWebsitePlan={handleApplyAiPlan}
          onShowToast={onShowToast}
        />
      ) : (
        /* Visual Editor View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: 20+ Templates Explorer & Customization Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Category Filter Pills */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#DFBA5A] block">
              1. Choose From 20+ Business Templates
            </label>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
                    activeCategory === cat
                      ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold'
                      : 'bg-[#12121A] text-[#8C8C9E] hover:text-white border border-[#1E1E28]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Scrollable Template Cards */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplate(t);
                    setBusinessName(t.name);
                    setTagline(t.description);
                    setThemeColor(t.accent_color);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    selectedTemplate.id === t.id
                      ? 'bg-[#161624] border-[#DFBA5A] shadow-md'
                      : 'bg-[#0E0E15] border-[#1C1C26] hover:border-[#2C2C3A]'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">{t.name}</span>
                      <span className="text-[10px] font-mono px-1.5 rounded bg-[#1C1C28] text-[#DFBA5A]">{t.badge}</span>
                    </div>
                    <p className="text-[11px] text-[#78788A] truncate max-w-xs">{t.description}</p>
                  </div>
                  {selectedTemplate.id === t.id && <Check className="w-4 h-4 text-[#DFBA5A] shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Customization Inputs */}
          <div className="bg-[#0E0E15] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1E1E2A]">
              2. Branding & Business Information
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#242434] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Tagline / Value Proposition</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#242434] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">City / Region</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#242434] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">WhatsApp Number</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#242434] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>
            </div>

            {/* Language Switcher */}
            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">
                Storefront Language (3 Languages Supported)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: 'en', label: 'English' },
                  { code: 'te', label: 'తెలుగు (Telugu)' },
                  { code: 'hi', label: 'हिन्दी (Hindi)' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setPreviewLanguage(lang.code as any)}
                    className={`py-2 px-1 rounded text-center text-xs font-medium border transition-colors ${
                      previewLanguage === lang.code
                        ? 'bg-[#181826] border-[#DFBA5A] text-[#DFBA5A] font-bold'
                        : 'bg-[#12121A] border-[#20202E] text-[#868698]'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Colors */}
            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Theme Accent Color</label>
              <div className="flex items-center gap-2">
                {['#DFBA5A', '#E65100', '#2E7D32', '#C2185B', '#1565C0', '#D32F2F', '#7B1FA2'].map((col) => (
                  <button
                    key={col}
                    onClick={() => setThemeColor(col)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      themeColor === col ? 'scale-110 border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: Live Interactive Storefront Preview */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Browser Chrome Header with Device Switcher */}
          <div className="bg-[#101018] border border-[#242436] rounded-t-xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="text-[11px] font-mono text-[#7A7A8E] ml-2 hidden sm:inline">
                {liveUrl}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded border border-[#1E1E28]">
                <button
                  onClick={() => setDeviceMode('desktop')}
                  className={`p-1 rounded ${deviceMode === 'desktop' ? 'bg-[#1C1C28] text-[#DFBA5A]' : 'text-[#707082]'}`}
                  title="Desktop View"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeviceMode('mobile')}
                  className={`p-1 rounded ${deviceMode === 'mobile' ? 'bg-[#1C1C28] text-[#DFBA5A]' : 'text-[#707082]'}`}
                  title="Mobile View"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handlePublishWebsite}
                className="px-3 py-1 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-[11px] font-bold"
              >
                Publish Live
              </button>
            </div>
          </div>

          {/* Browser Window Viewport */}
          <div className={`bg-[#08080C] border border-t-0 border-[#242436] rounded-b-xl overflow-hidden shadow-2xl transition-all mx-auto ${
            deviceMode === 'mobile' ? 'max-w-sm' : 'w-full'
          }`}>
            
            {/* Live Storefront Header */}
            <div className="p-5 border-b border-[#1A1A24] bg-gradient-to-r from-[#101018] to-[#0A0A0E] flex items-center justify-between">
              <div>
                <span className="font-luxury font-bold text-lg text-white block">
                  {businessName}
                </span>
                <p className="text-xs text-[#8A8A9E]">{tagline}</p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#D4AF37] mt-1">
                  <MapPin className="w-3 h-3" />
                  <span>{city} Metro · {t.deliveryInfo}</span>
                </div>
              </div>

              {/* Cart Button */}
              <button
                onClick={() => setShowCheckoutModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#14141E] border border-[#242434] text-xs font-semibold text-white hover:border-[#DFBA5A] transition-colors relative"
              >
                <ShoppingBag className="w-4 h-4 text-[#DFBA5A]" />
                <span className="hidden sm:inline">{t.cartTitle}</span>
                {cart.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#DFBA5A] text-[#0A0A0E] text-[10px] font-bold flex items-center justify-center">
                    {cart.reduce((s, i) => s + i.qty, 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Hero / Action Bar */}
            <div className="p-6 bg-gradient-to-b from-[#10101A] to-[#08080C] space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => addToCart('Speciality Box Item', 499)}
                  className="px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-[#0A0A0E] shadow"
                  style={{ backgroundColor: themeColor }}
                >
                  {t.orderNow}
                </button>

                <button
                  onClick={() => setShowBookingModal(true)}
                  className="px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-[#161622] border border-[#272738] hover:border-white transition-colors flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#DFBA5A]" />
                  <span>{t.bookAppointment}</span>
                </button>

                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello, I would like to enquire about ${businessName}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2.5 rounded-lg text-xs font-semibold text-[#25D366] bg-[#122615] border border-[#25D366]/30 flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{t.whatsappEnquiry}</span>
                </a>
              </div>
            </div>

            {/* Catalog Items Showcase */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#1A1A24]">
                <h4 className="font-luxury font-bold text-white text-sm">
                  {t.menuHeader}
                </h4>
                <span className="text-[11px] text-[#79798C] font-mono">
                  Category: {selectedTemplate.category}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { name: selectedTemplate.features[0] || 'Premium Package 01', price: 1250, desc: 'Highest rated choice by local customers.' },
                  { name: selectedTemplate.features[1] || 'Express Service Edition', price: 799, desc: 'Fast turnaround with certified quality.' },
                  { name: selectedTemplate.features[2] || 'Family / Business Bundle', price: 2100, desc: 'Complete comprehensive package.' },
                  { name: selectedTemplate.features[3] || 'Bespoke Custom Booking', price: 1500, desc: 'Tailored to your exact specifications.' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-bold text-white">{item.name}</h5>
                        <span className="font-mono font-bold text-[#DFBA5A]">₹{item.price}</span>
                      </div>
                      <p className="text-[11px] text-[#868698] mt-1">{item.desc}</p>
                    </div>

                    <button
                      onClick={() => addToCart(item.name, item.price)}
                      className="w-full py-1.5 rounded bg-[#161622] hover:bg-[#202030] text-[11px] font-semibold text-white border border-[#252536] flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-[#DFBA5A]" />
                      <span>{t.orderNow}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Google Maps & Directions Integration */}
            <div className="p-6 border-t border-[#1A1A24] bg-[#0A0A0F] space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-luxury font-bold text-white text-sm">{t.contactTitle}</span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(businessName + ', ' + city)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#DFBA5A] hover:underline text-[11px]"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{t.directions}</span>
                </a>
              </div>

              {/* Simulated Map Embed Frame */}
              <div className="relative aspect-[21/9] rounded-lg overflow-hidden border border-[#222232] bg-[#12121C] flex items-center justify-center text-center p-4">
                <div className="space-y-1">
                  <div className="w-7 h-7 rounded-full bg-[#DFBA5A] text-[#0A0A0E] flex items-center justify-center mx-auto shadow-md">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <p className="font-bold text-white text-xs">{businessName} Location</p>
                  <p className="text-[10px] text-[#828294] font-mono">17.3850° N, 78.4867° E · {city}</p>
                </div>
              </div>
            </div>

            {/* Storefront Footer */}
            <div className="p-4 bg-[#050508] border-t border-[#14141E] text-center text-[11px] text-[#555566]">
              Powered by Vijay Visuals Multi-Tenant Platform · © {new Date().getFullYear()} {businessName}
            </div>

          </div>

        </div>

      </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E16] border border-[#2D2D40] rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in duration-150 text-xs">
            <h3 className="font-luxury font-bold text-white text-base mb-1">
              Checkout & Place Order
            </h3>
            <p className="text-[11px] text-[#8C8C9E] mb-4">
              Your order will be instantly dispatched to our dedicated Delivery Fleet.
            </p>

            <form onSubmit={handleCheckoutSubmit} className="space-y-3">
              {/* Order summary */}
              <div className="p-3 bg-[#13131E] rounded-lg border border-[#222230] space-y-1.5">
                <span className="text-[10px] uppercase font-mono text-[#79798C] block">Cart Items</span>
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-white">
                    <span>{item.qty}x {item.name}</span>
                    <span className="font-mono">₹{item.price * item.qty}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#1C1C26] flex justify-between items-center font-bold text-[#DFBA5A]">
                  <span>Total Amount</span>
                  <span>₹{cart.reduce((s, i) => s + i.price * i.qty, 0)}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Customer Full Name</label>
                <input
                  type="text"
                  required
                  value={checkoutName}
                  onChange={(e) => setCheckoutName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Phone Number for Delivery Updates</label>
                <input
                  type="tel"
                  required
                  value={checkoutPhone}
                  onChange={(e) => setCheckoutPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Delivery Address</label>
                <textarea
                  rows={2}
                  required
                  value={checkoutAddress}
                  onChange={(e) => setCheckoutAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutPayment('upi')}
                    className={`py-2 px-3 rounded border text-center font-medium ${
                      checkoutPayment === 'upi'
                        ? 'bg-[#181826] border-[#25D366] text-[#25D366]'
                        : 'bg-[#12121A] border-[#20202E] text-[#868698]'
                    }`}
                  >
                    Instant UPI / QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutPayment('cod')}
                    className={`py-2 px-3 rounded border text-center font-medium ${
                      checkoutPayment === 'cod'
                        ? 'bg-[#181826] border-[#DFBA5A] text-[#DFBA5A]'
                        : 'bg-[#12121A] border-[#20202E] text-[#868698]'
                    }`}
                  >
                    Cash on Delivery
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="px-3 py-2 rounded text-[#848496] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] font-bold uppercase tracking-wider"
                >
                  Place Order & Assign Fleet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOOKING MODAL */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E16] border border-[#2D2D40] rounded-xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in duration-150 text-xs">
            <h3 className="font-luxury font-bold text-white text-base mb-1">
              Book Appointment / Slot
            </h3>
            <p className="text-[11px] text-[#8C8C9E] mb-4">
              Schedule a visit or consultation with {businessName}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Select Service</label>
                <input
                  type="text"
                  value={bookingService}
                  onChange={(e) => setBookingService(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#B0B0C0] block mb-1">Date</label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#B0B0C0] block mb-1">Time Slot</label>
                  <select
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs"
                  >
                    <option>10:00 AM</option>
                    <option>11:30 AM</option>
                    <option>02:00 PM</option>
                    <option>04:30 PM</option>
                    <option>06:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className="px-3 py-2 rounded text-[#848496] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onShowToast(`Appointment booked for ${bookingDate} at ${bookingTime}!`);
                    setShowBookingModal(false);
                  }}
                  className="px-4 py-2 rounded bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] font-bold"
                >
                  Confirm Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
