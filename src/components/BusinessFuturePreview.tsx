// ============================================================================
// VIJAY VISUALS — BUSINESS FUTURE PREVIEW SYSTEM
// Renders realistic, responsive customer-facing storefront previews across
// Desktop, Tablet, and Mobile with tabbed navigation:
// Homepage, Catalog, Product Details, About, Contact/Map, WhatsApp CTA,
// E-commerce Cart & Checkout, and Business Owner Admin Dashboard.
// ============================================================================

import React, { useState } from 'react';
import {
  Building2,
  Clock,
  Compass,
  CreditCard,
  ExternalLink,
  Eye,
  Heart,
  HelpCircle,
  Layout,
  Mail,
  MapPin,
  Menu,
  Minus,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  Monitor,
  User,
  X,
  Zap,
} from 'lucide-react';

export interface BusinessPreviewData {
  customerName: string;
  businessName: string;
  businessCategory: string;
  businessLogoUrl?: string;
  coverImageUrl?: string;
  businessPhotos?: string[];
  products?: Array<{
    name: string;
    price: number;
    category?: string;
    description?: string;
    imageUrl?: string;
  }>;
  phone?: string;
  whatsapp?: string;
  email?: string;
  businessAddress?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  openingHours?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
  };
  preferredColors?: {
    primary?: string;
    accent?: string;
    theme?: string;
  };
}

interface BusinessFuturePreviewProps {
  data: BusinessPreviewData;
  className?: string;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';
type PreviewPage = 'home' | 'catalog' | 'product_detail' | 'about' | 'contact' | 'checkout' | 'admin_preview';

export const BusinessFuturePreview: React.FC<BusinessFuturePreviewProps> = ({ data, className = '' }) => {
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [activePage, setActivePage] = useState<PreviewPage>('home');
  const [selectedProductIdx, setSelectedProductIdx] = useState(0);
  const [previewCart, setPreviewCart] = useState<Array<{ name: string; price: number; quantity: number }>>([
    { name: data.products?.[0]?.name || 'Signature Offering', price: data.products?.[0]?.price || 999, quantity: 1 },
  ]);

  const primaryColor = data.preferredColors?.primary || '#D4AF37';
  const categoryName = (data.businessCategory || 'Store')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const products = data.products && data.products.length > 0 ? data.products : [
    { name: 'Featured Collection 1', price: 999, category: 'Main', description: 'Curated premium offering with superior presentation and high demand.' },
    { name: 'Special Item 2', price: 1499, category: 'Popular', description: 'Bestseller customer choice with personalized options and fast service.' },
    { name: 'Deluxe Combo Package', price: 2999, category: 'Exclusive', description: 'Complete high-value bundle with all essentials and priority perks.' },
  ];

  const currentProduct = products[selectedProductIdx] || products[0];

  const cartSubtotal = previewCart.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const containerWidthClass =
    device === 'mobile' ? 'max-w-[390px]' : device === 'tablet' ? 'max-w-[768px]' : 'max-w-[1140px]';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Device & Page Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0D0D14] border border-[#222232] rounded-xl p-3">
        <div className="flex items-center gap-1.5 bg-[#14141F] border border-[#27273C] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              device === 'desktop' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#8E8EA2] hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice('tablet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              device === 'tablet' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#8E8EA2] hover:text-white'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              device === 'mobile' ? 'bg-[#D4AF37] text-black shadow' : 'text-[#8E8EA2] hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile (375px)</span>
          </button>
        </div>

        {/* Page Switcher */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-xs">
          {[
            { id: 'home', label: 'Home' },
            { id: 'catalog', label: 'Catalog' },
            { id: 'product_detail', label: 'Product Details' },
            { id: 'checkout', label: 'Cart & Checkout' },
            { id: 'about', label: 'About' },
            { id: 'contact', label: 'Contact & Map' },
            { id: 'admin_preview', label: 'Admin Dashboard' },
          ].map((pg) => (
            <button
              key={pg.id}
              type="button"
              onClick={() => setActivePage(pg.id as PreviewPage)}
              className={`px-2.5 py-1.5 rounded-md whitespace-nowrap text-xs font-medium transition-colors ${
                activePage === pg.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-[#8E8EA2] hover:text-white hover:bg-[#1A1A28]'
              }`}
            >
              {pg.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#A0A0B4]">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden md:inline font-mono text-[10px]">PREVIEW MODE · LIVE ARCHITECTURE</span>
        </div>
      </div>

      {/* Simulated Browser Frame */}
      <div className="flex justify-center transition-all duration-300">
        <div
          className={`w-full ${containerWidthClass} bg-[#0A0A0F] border-2 border-[#2A2A3E] rounded-2xl shadow-2xl overflow-hidden transition-all duration-300`}
        >
          {/* Browser Address Bar Chrome */}
          <div className="bg-[#12121C] border-b border-[#232334] px-4 py-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="flex-1 max-w-md mx-auto bg-[#08080C] border border-[#222232] rounded-md px-3 py-1 flex items-center justify-between text-[11px] text-[#8E8EA2]">
              <span className="truncate">
                https://{data.businessName.toLowerCase().replace(/[^a-z0-9]/g, '')}.vijayvisuals.com/{activePage === 'home' ? '' : activePage}
              </span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />
            </div>
          </div>

          {/* Illustrative Demo Banner */}
          <div className="bg-amber-950/40 border-b border-amber-500/30 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-200">
            <span className="flex items-center gap-1.5">
              <span className="font-bold uppercase tracking-wider text-[9px] bg-amber-400 text-black px-1.5 py-0.5 rounded">Illustrative Demo</span>
              <span>Menu items, prices, and reviews shown below are sample demonstration data.</span>
            </span>
            <span className="text-[10px] text-amber-300/80 hidden sm:inline">Replaced with your verified business assets</span>
          </div>

          {/* Storefront Navigation Bar */}
          <header className="border-b border-[#1E1E2C] bg-[#0E0E16]/95 backdrop-blur px-4 py-3 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-2.5">
              {data.businessLogoUrl ? (
                <img src={data.businessLogoUrl} alt="Logo" width={28} height={28} loading="lazy" decoding="async" className="w-7 h-7 rounded-md object-cover border border-amber-500/30" />
              ) : (
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-black"
                  style={{ backgroundColor: primaryColor }}
                >
                  {data.businessName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <span className="font-bold text-sm text-white tracking-wide">{data.businessName}</span>
                <span className="hidden sm:inline-block ml-2 text-[10px] text-amber-300 font-mono">
                  {categoryName}
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-4 text-xs text-[#A0A0B8]">
              <button type="button" onClick={() => setActivePage('home')} className={activePage === 'home' ? 'text-white font-semibold' : 'hover:text-white'}>Home</button>
              <button type="button" onClick={() => setActivePage('catalog')} className={activePage === 'catalog' ? 'text-white font-semibold' : 'hover:text-white'}>Catalog</button>
              <button type="button" onClick={() => setActivePage('about')} className={activePage === 'about' ? 'text-white font-semibold' : 'hover:text-white'}>About</button>
              <button type="button" onClick={() => setActivePage('contact')} className={activePage === 'contact' ? 'text-white font-semibold' : 'hover:text-white'}>Contact</button>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePage('checkout')}
                className="relative p-2 rounded-lg bg-[#1A1A28] text-white hover:bg-[#252538] transition-colors"
                title="View Cart"
              >
                <ShoppingCart className="w-4 h-4 text-amber-300" />
                {previewCart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-400 text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {previewCart.reduce((sum, it) => sum + it.quantity, 0)}
                  </span>
                )}
              </button>
              <a
                href={`https://wa.me/${(data.whatsapp || data.phone || '919381362201').replace(/[^0-9]/g, '')}?text=Hello%20${encodeURIComponent(data.businessName)}`}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-500/30"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </header>

          {/* Page Contents */}
          <div className="min-h-[480px] bg-[#0A0A0F]">
            {/* 1. HOMEPAGE */}
            {activePage === 'home' && (
              <div className="space-y-8 pb-10">
                {/* Hero Banner */}
                <div
                  className="relative px-6 py-16 text-center border-b border-[#202030] overflow-hidden"
                  style={{
                    background: `radial-gradient(circle at 50% 20%, rgba(212, 175, 55, 0.15) 0%, #0A0A0F 80%)`,
                  }}
                >
                  <div className="max-w-xl mx-auto space-y-3 relative z-10">
                    <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase border border-amber-500/40 bg-amber-950/20 text-amber-300">
                      Welcome to {data.businessName}
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      Premium {categoryName} in {data.city || 'Hyderabad'}
                    </h1>
                    <p className="text-xs sm:text-sm text-[#A0A0B8] leading-relaxed">
                      Experience our signature offerings, fast ordering, and seamless WhatsApp & online checkout.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setActivePage('catalog')}
                        className="px-5 py-2.5 rounded-lg font-bold text-xs text-black shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Explore Menu & Catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePage('contact')}
                        className="px-4 py-2.5 rounded-lg font-semibold text-xs text-white border border-[#333348] hover:bg-[#1A1A28]"
                      >
                        Visit Shop / Map
                      </button>
                    </div>
                  </div>
                </div>

                {/* Highlights / Features Banner */}
                <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-[#11111A] border border-[#222232] p-3 rounded-lg">
                    <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-white">Instant Ordering</div>
                    <div className="text-[10px] text-[#8E8EA2]">UPI, QR & Cards</div>
                  </div>
                  <div className="bg-[#11111A] border border-[#222232] p-3 rounded-lg">
                    <MessageCircle className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-white">WhatsApp Chat</div>
                    <div className="text-[10px] text-[#8E8EA2]">Direct Inquiries</div>
                  </div>
                  <div className="bg-[#11111A] border border-[#222232] p-3 rounded-lg">
                    <MapPin className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-white">{data.area || data.city || 'Local Area'}</div>
                    <div className="text-[10px] text-[#8E8EA2]">Fast Local Delivery</div>
                  </div>
                  <div className="bg-[#11111A] border border-[#222232] p-3 rounded-lg">
                    <ShieldCheck className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <div className="text-xs font-semibold text-white">Quality Assured</div>
                    <div className="text-[10px] text-[#8E8EA2]">Curated Inclusions [Demo]</div>
                  </div>
                </div>

                {/* Featured Products Grid */}
                <div className="max-w-4xl mx-auto px-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white">Featured Catalog Items</h2>
                      <p className="text-[11px] text-[#8E8EA2]">Selected signature items and current specials</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePage('catalog')}
                      className="text-xs font-semibold text-amber-300 hover:underline"
                    >
                      View All &rarr;
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {products.slice(0, 3).map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-[#11111A] border border-[#202030] rounded-xl p-3.5 flex flex-col justify-between hover:border-amber-500/40 transition-colors"
                      >
                        <div className="space-y-1.5">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                            {item.category || 'Featured'}
                          </span>
                          <h3 className="text-xs font-bold text-white pt-1">{item.name}</h3>
                          <p className="text-[10px] text-[#8E8EA2] line-clamp-2">{item.description}</p>
                        </div>
                        <div className="pt-3 flex items-center justify-between border-t border-[#1C1C2A] mt-3">
                          <span className="font-extrabold text-sm text-white">₹{item.price.toLocaleString('en-IN')}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductIdx(idx);
                              setActivePage('product_detail');
                            }}
                            className="px-2.5 py-1 rounded bg-[#1F1F2F] text-amber-300 text-xs font-medium hover:bg-amber-400 hover:text-black transition-colors"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. CATALOG PAGE */}
            {activePage === 'catalog' && (
              <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202030] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">Catalog & Offerings</h2>
                      <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Illustrative Demo</span>
                    </div>
                    <p className="text-xs text-[#8E8EA2]">{products.length} offerings available online</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {products.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-[#11111A] border border-[#202030] rounded-xl p-3.5 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded">
                            {item.category || 'Standard'}
                          </span>
                        </div>
                        <h3 className="text-xs font-bold text-white">{item.name}</h3>
                        <p className="text-[10px] text-[#8E8EA2] line-clamp-2">{item.description}</p>
                      </div>
                      <div className="pt-3 flex items-center justify-between border-t border-[#1C1C2A] mt-3">
                        <span className="font-extrabold text-sm text-white">₹{item.price.toLocaleString('en-IN')}</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductIdx(idx);
                              setActivePage('product_detail');
                            }}
                            className="px-2 py-1 rounded border border-[#2C2C40] text-white text-xs hover:bg-[#1A1A28]"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewCart((prev) => {
                                const exist = prev.find((p) => p.name === item.name);
                                if (exist) return prev.map((p) => p.name === item.name ? { ...p, quantity: p.quantity + 1 } : p);
                                return [...prev, { name: item.name, price: item.price, quantity: 1 }];
                              });
                              setActivePage('checkout');
                            }}
                            className="px-2.5 py-1 rounded bg-[#D4AF37] text-black text-xs font-semibold"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. PRODUCT DETAILS PAGE */}
            {activePage === 'product_detail' && (
              <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                <button
                  type="button"
                  onClick={() => setActivePage('catalog')}
                  className="text-xs text-amber-300 hover:underline flex items-center gap-1"
                >
                  &larr; Back to Catalog
                </button>

                <div className="bg-[#12121C] border border-[#222234] rounded-xl p-5 space-y-4">
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded">
                      {currentProduct.category || 'Featured'}
                    </span>
                    <h2 className="text-xl font-bold text-white">{currentProduct.name}</h2>
                    <p className="text-xs text-[#B0B0C4] leading-relaxed">{currentProduct.description}</p>
                  </div>

                  <div className="pt-3 border-t border-[#222232] flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-[#7C7C92] uppercase">Price</div>
                      <div className="text-xl font-extrabold text-white">₹{currentProduct.price.toLocaleString('en-IN')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewCart((prev) => {
                          const exist = prev.find((p) => p.name === currentProduct.name);
                          if (exist) return prev.map((p) => p.name === currentProduct.name ? { ...p, quantity: p.quantity + 1 } : p);
                          return [...prev, { name: currentProduct.name, price: currentProduct.price, quantity: 1 }];
                        });
                        setActivePage('checkout');
                      }}
                      className="px-5 py-2.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold shadow-lg"
                    >
                      Add to Cart & Checkout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. CART & CHECKOUT PAGE */}
            {activePage === 'checkout' && (
              <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
                <div className="flex items-center justify-between border-b border-[#202030] pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-amber-300" />
                    <span>Shopping Cart & Cashfree Checkout</span>
                  </h2>
                  <span className="text-xs text-amber-300 font-mono">Total: ₹{cartSubtotal.toLocaleString('en-IN')}</span>
                </div>

                {previewCart.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <p className="text-xs text-[#8E8EA2]">Your preview cart is currently empty.</p>
                    <button
                      type="button"
                      onClick={() => setActivePage('catalog')}
                      className="text-xs text-amber-300 font-semibold hover:underline"
                    >
                      Add an item from catalog &rarr;
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {previewCart.map((it, idx) => (
                        <div
                          key={idx}
                          className="bg-[#12121C] border border-[#222232] rounded-lg p-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white">{it.name}</div>
                            <div className="text-[#8E8EA2] text-[10px]">₹{it.price.toLocaleString('en-IN')} each</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-white">Qty: {it.quantity}</span>
                            <span className="font-bold text-amber-300">₹{(it.price * it.quantity).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Supported Payment Badges */}
                    <div className="bg-[#12121B] border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Supported Cashfree Payment Methods</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-center pt-1">
                        <div className="bg-[#181826] p-2 rounded border border-[#28283E]">
                          <strong className="text-white block">UPI Apps</strong>
                          <span className="text-[#8E8EA2] text-[9px]">GPay, PhonePe, Paytm</span>
                        </div>
                        <div className="bg-[#181826] p-2 rounded border border-[#28283E]">
                          <strong className="text-white block">Dynamic QR</strong>
                          <span className="text-[#8E8EA2] text-[9px]">Scan & Pay</span>
                        </div>
                        <div className="bg-[#181826] p-2 rounded border border-[#28283E]">
                          <strong className="text-white block">Debit & Credit</strong>
                          <span className="text-[#8E8EA2] text-[9px]">Visa, RuPay, MC</span>
                        </div>
                        <div className="bg-[#181826] p-2 rounded border border-[#28283E]">
                          <strong className="text-white block">Net Banking</strong>
                          <span className="text-[#8E8EA2] text-[9px]">50+ Top Banks</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-emerald-300 text-[11px] text-center">
                      ✓ Instant checkout verification and automated merchant settlement.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. ABOUT PAGE */}
            {activePage === 'about' && (
              <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">About {data.businessName}</h2>
                  <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Demo Story</span>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-1.5">
                  <span className="font-bold uppercase tracking-wider text-[8px] bg-amber-400 text-black px-1.5 py-0.5 rounded">Demo Data</span>
                  <span>Illustrative business story. Your authentic business history and owner profile will be published here upon launch.</span>
                </div>
                <div className="bg-[#12121C] border border-[#222232] rounded-xl p-5 space-y-3 text-xs text-[#B0B0C4] leading-relaxed">
                  <p>
                    {data.businessName} is dedicated to serving customers in {data.city || 'Hyderabad'} and surrounding areas with high-quality {categoryName.toLowerCase()} products and personalized attention.
                  </p>
                  <p>
                    Established with a mission of transparency, genuine craftsmanship, and community trust, we provide modern online conveniences paired with local hospitality.
                  </p>
                </div>
              </div>
            )}

            {/* 6. CONTACT & MAP PAGE */}
            {activePage === 'contact' && (
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Visit & Contact Us</h2>
                  <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Demo Location</span>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-1.5">
                  <span className="font-bold uppercase tracking-wider text-[8px] bg-amber-400 text-black px-1.5 py-0.5 rounded">Demo Data</span>
                  <span>Addresses, phone numbers, and business hours shown below are illustrative placeholders until verified client onboarding.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-[#12121C] border border-[#222232] rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white block">Shop Address:</strong>
                        <span className="text-[#9A9AB4]">{data.businessAddress || 'Plot 42, Main Road'}, {data.area || ''}, {data.city || 'Hyderabad'}, {data.state || 'Telangana'} - {data.pincode || '500081'}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white block">Business Hours:</strong>
                        <span className="text-[#9A9AB4]">{data.openingHours || 'Monday – Saturday: 10:00 AM – 9:00 PM'}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Phone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white block">Phone & WhatsApp:</strong>
                        <a
                          href={`tel:${(data.phone || '+91 9381362201').replace(/\s+/g, '')}`}
                          className="text-[#ECC86A] hover:underline"
                        >
                          {data.phone || '+91 9381362201'}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white block">Official Email:</strong>
                        <a
                          href={`mailto:${data.email || 'vk66278@gmail.com'}`}
                          className="text-[#ECC86A] hover:underline"
                        >
                          {data.email || 'vk66278@gmail.com'}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Simulated Map */}
                  <div className="bg-[#12121C] border border-[#222232] rounded-xl p-4 flex flex-col justify-center items-center text-center space-y-2">
                    <Compass className="w-8 h-8 text-amber-400 animate-spin" style={{ animationDuration: '8s' }} />
                    <div className="font-bold text-white">Interactive Google Map Location</div>
                    <p className="text-[10px] text-[#8E8EA2] max-w-xs">
                      Walk-in navigation for {data.area || data.city || 'your store locality'}. Customers click once for turn-by-turn driving directions.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 7. ADMIN DASHBOARD PREVIEW */}
            {activePage === 'admin_preview' && (
              <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#202030] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Layout className="w-4 h-4 text-amber-300" />
                      <span>{data.businessName} Owner Dashboard (Included)</span>
                    </h2>
                    <p className="text-xs text-[#8E8EA2]">Self-editing business management portal</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Full Owner Rights
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-[#12121C] border border-[#232336] p-3 rounded-lg">
                    <div className="text-[10px] text-[#7C7C92] uppercase">Today's Orders</div>
                    <div className="text-lg font-bold text-white mt-1">12</div>
                  </div>
                  <div className="bg-[#12121C] border border-[#232336] p-3 rounded-lg">
                    <div className="text-[10px] text-[#7C7C92] uppercase">Total Sales</div>
                    <div className="text-lg font-bold text-[#ECC86A] mt-1">₹18,450</div>
                  </div>
                  <div className="bg-[#12121C] border border-[#232336] p-3 rounded-lg">
                    <div className="text-[10px] text-[#7C7C92] uppercase">Active Items</div>
                    <div className="text-lg font-bold text-white mt-1">{products.length}</div>
                  </div>
                  <div className="bg-[#12121C] border border-[#232336] p-3 rounded-lg">
                    <div className="text-[10px] text-[#7C7C92] uppercase">Cashfree PG</div>
                    <div className="text-xs font-bold text-emerald-400 mt-2">Active</div>
                  </div>
                </div>

                <div className="bg-[#12121C] border border-[#232336] rounded-xl p-4 space-y-2 text-xs">
                  <strong className="text-white block font-semibold">Self-Editing Capabilities Available to You:</strong>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#9A9AB4] text-[11px] pt-1">
                    <div>✓ Add, edit & remove products & prices instantly</div>
                    <div>✓ Upload & replace hero banners & shop photos</div>
                    <div>✓ View incoming orders & update statuses</div>
                    <div>✓ Generate & print official GST tax invoices</div>
                    <div>✓ Connect your custom domain with 1 click</div>
                    <div>✓ Zero developer fees or agency dependencies</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Storefront Footer */}
          <footer className="border-t border-[#1C1C28] bg-[#08080C] px-4 py-3 text-center text-[10px] text-[#6E6E82]">
            &copy; {new Date().getFullYear()} {data.businessName} · Designed & Engineered by Vijay Visuals Digital Architecture
          </footer>
        </div>
      </div>
    </div>
  );
};
