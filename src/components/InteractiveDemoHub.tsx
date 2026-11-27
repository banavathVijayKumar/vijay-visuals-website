// ============================================================================
// src/components/InteractiveDemoHub.tsx — Real Website Interactive Demo Experience
// Provides prospective customers with a fully functional working storefront,
// desktop & mobile viewport simulation, live catalog, interactive cart,
// simulated checkout with zero real money charges, customer account tracking,
// merchant admin preview, live logo customizer, and transparent domain guidance.
// ============================================================================

import React, { useState } from 'react';
import {
  Smartphone,
  Monitor,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  Tag,
  CreditCard,
  QrCode,
  Package,
  Clock,
  ChevronRight,
  ExternalLink,
  Globe,
  Store,
  Layers,
  Settings,
  X,
  FileText,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { CurrencyCode, formatMoneyFromInr } from '../data/content';
import { CustomerLogoCustomizer, LogoConfig } from './CustomerLogoCustomizer';

interface DemoProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewCount: number;
  badge?: string;
  image: string;
  description: string;
}

interface CartItem {
  product: DemoProduct;
  quantity: number;
}

interface InteractiveDemoHubProps {
  onNavigatePlan: (planCode: string) => void;
  onGoBuilder: () => void;
  onNotify?: (msg: string) => void;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 1,
    name: 'Hyderabadi Dum Biryani (Royal Handi)',
    category: 'signature',
    price: 499,
    originalPrice: 650,
    rating: 4.9,
    reviewCount: 312,
    badge: 'Best Seller',
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
    description: 'Slow-cooked fragrant basmati rice with marinated spices and tender saffron chicken in an artisanal sealed handi.',
  },
  {
    id: 2,
    name: 'Artisanal Truffle Butter Naan Basket',
    category: 'breads',
    price: 249,
    originalPrice: 320,
    rating: 4.8,
    reviewCount: 145,
    badge: 'Chef Choice',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
    description: 'Tandoor-baked layered flatbread brushed with black truffle butter and toasted sesame seeds.',
  },
  {
    id: 3,
    name: 'Paneer Butter Masala (Old Delhi Recipe)',
    category: 'signature',
    price: 420,
    originalPrice: 500,
    rating: 4.9,
    reviewCount: 280,
    badge: 'Pure Veg',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80',
    description: 'Fresh farm malai paneer simmered in a velvety cashew and ripe tomato gravy with fenugreek leaves.',
  },
  {
    id: 4,
    name: 'Gulab Jamun Cheesecake Fusion',
    category: 'desserts',
    price: 350,
    originalPrice: 450,
    rating: 5.0,
    reviewCount: 96,
    badge: 'House Special',
    image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=600&auto=format&fit=crop&q=80',
    description: 'New York style baked cream cheesecake infused with cardamom syrup and whole warm gulab jamuns.',
  },
  {
    id: 5,
    name: 'Kashmiri Saffron Kahwa Tea (350ml)',
    category: 'beverages',
    price: 180,
    originalPrice: 220,
    rating: 4.7,
    reviewCount: 88,
    badge: 'Immunity',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
    description: 'Brewed green tea with whole saffron strands, crushed almonds, cinnamon bark, and green cardamom.',
  },
  {
    id: 6,
    name: 'Smoked Mutton Galouti Kebabs (6 Pcs)',
    category: 'starters',
    price: 580,
    originalPrice: 720,
    rating: 4.9,
    reviewCount: 194,
    badge: 'Melt in Mouth',
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80',
    description: 'Finely minced tender mutton patties smoked with cloves and Awadhi potli masala, served with mint chutney.',
  },
];

export const InteractiveDemoHub: React.FC<InteractiveDemoHubProps> = ({
  onNavigatePlan,
  onGoBuilder,
  onNotify,
}) => {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState<'all' | 'signature' | 'breads' | 'desserts' | 'beverages'>('all');
  const [activePerspective, setActivePerspective] = useState<'storefront' | 'merchant_admin'>('storefront');
  const [showLogoStudio, setShowLogoStudio] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([
    { product: DEMO_PRODUCTS[0], quantity: 1 },
    { product: DEMO_PRODUCTS[1], quantity: 2 },
  ]);
  const [cartOpen, setCartOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('VIJAY10');
  const [discountApplied, setDiscountApplied] = useState(true);

  // Simulated Checkout State
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMethod, setCheckoutMethod] = useState<'upi' | 'card' | 'cod'>('upi');
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<any | null>(null);

  // Customizable Demo Brand Logo
  const [demoLogo, setDemoLogo] = useState<LogoConfig>({
    type: 'text',
    businessName: 'Royal Feast Cloud Kitchen',
    initials: 'RF',
    tagline: 'Authentic Nawabi Flavors Delivered',
    fontFamily: 'font-luxury',
    layout: 'badge_left',
    badgeShape: 'shield',
    badgeBgColor: '#1A1208',
    badgeBorderColor: '#D4AF37',
    badgeTextColor: '#D4AF37',
    nameTextColor: '#FFFFFF',
    taglineTextColor: '#ECC86A',
    size: 'md',
    letterSpacing: 'luxury',
  });

  const addToCart = (product: DemoProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    onNotify?.(`Added "${product.name}" to cart!`);
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const next = item.quantity + delta;
            return next > 0 ? { ...item, quantity: next } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discountAmount = discountApplied ? Math.round(subtotal * 0.1) : 0;
  const gstAmount = Math.round((subtotal - discountAmount) * 0.05); // 5% GST for cloud kitchen
  const deliveryFee = subtotal > 499 ? 0 : 49;
  const totalAmount = subtotal - discountAmount + gstAmount + deliveryFee;

  const handleSimulateCheckout = () => {
    setSimulatingPayment(true);
    setTimeout(() => {
      const order = {
        orderId: `ORD-DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
        items: [...cart],
        amount: totalAmount,
        method: checkoutMethod.toUpperCase(),
        placedAt: new Date().toLocaleTimeString(),
        status: 'Preparing in Kitchen',
        customer: {
          name: 'Priya Sharma',
          phone: '+91 98765 43210',
          address: 'Flat 402, Lotus Residency, Hitec City, Hyderabad',
        },
      };
      setPlacedOrder(order);
      setCart([]);
      setSimulatingPayment(false);
      onNotify?.(`Simulated order ${order.orderId} placed successfully!`);
    }, 1200);
  };

  const filteredProducts =
    activeTab === 'all'
      ? DEMO_PRODUCTS
      : DEMO_PRODUCTS.filter((p) => p.category === activeTab);

  return (
    <div className="min-h-screen bg-[#08080A] text-[#E4E4EE] py-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Announcement & Switcher Bar */}
        <div className="rounded-2xl border border-[#2E2E42] bg-gradient-to-r from-[#11111B] via-[#161626] to-[#11111B] p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Working Interactive Storefront Demo</span>
              </div>
              <h1 className="font-luxury text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Experience What You Get After Purchase
              </h1>
              <p className="text-xs text-[#9E9EB6] mt-1 max-w-2xl">
                Every Vijay Visuals website is a fully responsive, autonomous e-commerce engine with real cart management, simulated checkout, order tracking, and custom branding.
              </p>
            </div>

            {/* Viewport & View Mode Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Perspective Toggle */}
              <div className="flex rounded-lg bg-[#0B0B11] p-1 border border-[#252536]">
                <button
                  type="button"
                  onClick={() => setActivePerspective('storefront')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activePerspective === 'storefront'
                      ? 'bg-[#D4AF37] text-[#08080A]'
                      : 'text-[#8E8EA2] hover:text-white'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Customer Storefront</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePerspective('merchant_admin')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activePerspective === 'merchant_admin'
                      ? 'bg-[#D4AF37] text-[#08080A]'
                      : 'text-[#8E8EA2] hover:text-white'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Merchant Admin Preview</span>
                </button>
              </div>

              {/* Viewport Device Switcher */}
              <div className="flex rounded-lg bg-[#0B0B11] p-1 border border-[#252536]">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  className={`p-1.5 rounded transition-colors ${
                    viewport === 'desktop'
                      ? 'bg-[#2A2A3E] text-[#D4AF37]'
                      : 'text-[#8E8EA2] hover:text-white'
                  }`}
                  title="Desktop Widescreen Preview"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  className={`p-1.5 rounded transition-colors ${
                    viewport === 'mobile'
                      ? 'bg-[#2A2A3E] text-[#D4AF37]'
                      : 'text-[#8E8EA2] hover:text-white'
                  }`}
                  title="Mobile 375px Device Preview"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Logo Customizer Trigger */}
              <button
                type="button"
                onClick={() => setShowLogoStudio(true)}
                className="px-3 py-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#161208] text-xs font-semibold text-[#ECC86A] hover:bg-[#201A0B] flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Customize Demo Logo</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-[#D6C7A0] leading-relaxed">
          <strong className="text-amber-300">Simulation only.</strong> The storefront, catalog, merchant figures,
          orders, domain name, SSL state, and deployment/publishing actions below are illustrative. No domain,
          certificate, publication, payment, refund, or email is created or configured by this demo.
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* SIMULATED DEMO STOREFRONT CONTAINER                                */}
        {/* ------------------------------------------------------------------ */}
        <div
          className={`mx-auto transition-all duration-300 ${
            viewport === 'mobile'
              ? 'max-w-[400px] w-full border-4 sm:border-[10px] border-[#1E1E2C] rounded-[28px] sm:rounded-[42px] shadow-2xl p-2 bg-[#09090E]'
              : 'w-full rounded-2xl border border-[#232334] bg-[#0A0A10] shadow-xl overflow-hidden'
          }`}
        >
          {/* Simulated Mobile Status Bar or Desktop Browser Bar */}
          {viewport === 'desktop' ? (
            <div className="bg-[#12121A] px-4 py-2 border-b border-[#20202E] flex items-center justify-between text-xs text-[#7B7B90]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E53E3E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#D69E2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#38A169]" />
                <span className="ml-2 font-mono text-[11px] text-[#A5A5B8]">
                  simulated://demo-storefront (no domain configured)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-500/30">
                  SIMULATED DEMO ENVIRONMENT
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-600/50">
                  NO DOMAIN · NO SSL · NOT DEPLOYED
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-5 pt-2 pb-1 text-[11px] text-[#868698] font-semibold border-b border-white/5">
              <span>9:41 AM</span>
              <div className="w-20 h-4 bg-black rounded-full mx-auto" />
              <span>5G · 100%</span>
            </div>
          )}

          {/* PERSPECTIVE 1: STOREFRONT */}
          {activePerspective === 'storefront' ? (
            <div className="bg-[#09090E] p-4 sm:p-6 space-y-6">
              {/* Storefront Header */}
              <header className="rounded-xl border border-[#20202E] bg-[#0E0E16] p-4 flex items-center justify-between gap-4 sticky top-2 z-20 shadow-md">
                <div className="flex items-center gap-3">
                  {/* Dynamic Customizer Logo */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold font-mono text-sm border-2 shrink-0"
                    style={{
                      backgroundColor: demoLogo.badgeBgColor,
                      borderColor: demoLogo.badgeBorderColor,
                      color: demoLogo.badgeTextColor,
                    }}
                  >
                    {demoLogo.initials}
                  </div>
                  <div>
                    <h2
                      className={`font-bold leading-tight ${demoLogo.fontFamily} text-sm sm:text-base`}
                      style={{ color: demoLogo.nameTextColor }}
                    >
                      {demoLogo.businessName}
                    </h2>
                    {demoLogo.tagline && (
                      <p
                        className="text-[10px] uppercase tracking-wider font-medium truncate max-w-[200px]"
                        style={{ color: demoLogo.taglineTextColor }}
                      >
                        {demoLogo.tagline}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="relative px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#08080A] font-bold text-xs flex items-center gap-1.5 shadow hover:opacity-95 transition-opacity"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Cart</span>
                    {cart.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#08080A] text-[#ECC86A] text-[10px] flex items-center justify-center font-black">
                        {cart.reduce((s, i) => s + i.quantity, 0)}
                      </span>
                    )}
                  </button>
                </div>
              </header>

              {/* Storefront Hero Banner */}
              <div className="relative rounded-2xl overflow-hidden border border-[#222232] bg-gradient-to-r from-[#17120B] via-[#0E0E16] to-[#0A0A10] p-6 sm:p-8 flex flex-col justify-center min-h-[180px]">
                <div className="max-w-md space-y-2 relative z-10">
                  <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 tracking-wider uppercase">
                    Chef Special Autumn Menu
                  </span>
                  <h3 className="font-luxury text-xl sm:text-2xl font-bold text-white leading-tight">
                    Artisanal Nawabi Delicacies Handcrafted Daily
                  </h3>
                  <p className="text-xs text-[#A1A1B4]">
                    Prepared in hygienic commercial cloud kitchens and delivered piping hot across the city in under 45 minutes.
                  </p>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#1A1A26]">
                {[
                  { id: 'all', label: 'All Items' },
                  { id: 'signature', label: 'Signature Dishes' },
                  { id: 'breads', label: 'Tandoor Breads' },
                  { id: 'desserts', label: 'Desserts' },
                  { id: 'beverages', label: 'Beverages' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveTab(cat.id as any)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === cat.id
                        ? 'bg-[#D4AF37] text-[#08080A]'
                        : 'bg-[#12121A] text-[#9393A6] hover:text-white border border-[#222230]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-[#20202E] bg-[#0E0E16] overflow-hidden flex flex-col hover:border-[#D4AF37]/50 transition-colors shadow-lg"
                  >
                    <div className="aspect-[16/10] bg-[#14141E] relative overflow-hidden">
                      <img src={p.image} alt={p.name} width={800} height={500} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      {p.badge && (
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold bg-black/75 text-[#D4AF37] border border-[#D4AF37]/30 backdrop-blur-sm">
                          {p.badge}
                        </span>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-[#8E8EA0] mb-1">
                          <span className="capitalize">{p.category}</span>
                          <span className="text-[#ECC86A] font-bold">{p.rating} ★ ({p.reviewCount})</span>
                        </div>
                        <h4 className="font-semibold text-sm text-white leading-snug">{p.name}</h4>
                        <p className="text-[11px] text-[#7A7A8E] line-clamp-2 mt-1">{p.description}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#1C1C28]">
                        <div>
                          <span className="text-sm font-bold text-white">₹{p.price}</span>
                          <span className="text-[10px] text-[#747488] line-through ml-1.5">₹{p.originalPrice}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity flex items-center gap-1 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Status Display if an order was placed */}
              {placedOrder && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simulated Order Confirmation (No Real Order)</span>
                    </div>
                    <span className="font-mono text-xs text-white">{placedOrder.orderId}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] text-[#A6A6BC] pt-1">
                    <div>
                      <span className="text-[#737388] block">Status:</span>
                      <span className="text-emerald-400 font-bold">{placedOrder.status}</span>
                    </div>
                    <div>
                      <span className="text-[#737388] block">Total Amount:</span>
                      <span className="text-white font-bold">₹{placedOrder.amount}</span>
                    </div>
                    <div>
                      <span className="text-[#737388] block">Payment:</span>
                      <span className="text-white">{placedOrder.method} (Simulated)</span>
                    </div>
                    <div>
                      <span className="text-[#737388] block">Delivery To:</span>
                      <span className="text-white truncate block">{placedOrder.customer.address}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PERSPECTIVE 2: MERCHANT ADMIN BACK-OFFICE PREVIEW */
            <div className="bg-[#09090E] p-4 sm:p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[#20202E] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#D4AF37]" />
                    <span>Merchant Dashboard (Owner View)</span>
                  </h3>
                  <p className="text-[11px] text-[#868698]">
                    This is the back-office dashboard you receive to manage products, orders, and delivery riders.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  SAMPLE DATA · NO LIVE SYNC
                </span>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-[#20202E] bg-[#111118] p-3 text-center">
                  <span className="text-[10px] text-[#868698] block">Sample Revenue (Illustrative)</span>
                  <span className="text-base font-bold text-white mt-0.5 block">
                    ₹{placedOrder ? (12480 + placedOrder.amount).toLocaleString('en-IN') : '12,480'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#20202E] bg-[#111118] p-3 text-center">
                  <span className="text-[10px] text-[#868698] block">Sample Active Orders</span>
                  <span className="text-base font-bold text-[#D4AF37] mt-0.5 block">
                    {placedOrder ? 4 : 3} Orders
                  </span>
                </div>
                <div className="rounded-lg border border-[#20202E] bg-[#111118] p-3 text-center">
                  <span className="text-[10px] text-[#868698] block">Sample Deliveries</span>
                  <span className="text-base font-bold text-emerald-400 mt-0.5 block">28 Completed</span>
                </div>
                <div className="rounded-lg border border-[#20202E] bg-[#111118] p-3 text-center">
                  <span className="text-[10px] text-[#868698] block">Catalog Status</span>
                  <span className="text-base font-bold text-white mt-0.5 block">6 Sample Items</span>
                </div>
              </div>

              {/* Recent Orders Queue */}
              <div className="rounded-xl border border-[#222232] bg-[#0E0E15] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#1E1E2C] flex items-center justify-between text-xs font-semibold text-white">
                  <span>Incoming Store Orders</span>
                  <span className="text-[10px] text-[#7A7A8E]">Simulated Dispatch · No Delivery Created</span>
                </div>
                <div className="divide-y divide-[#181824] text-xs">
                  {placedOrder && (
                    <div className="p-3 bg-[#161622] flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-mono text-emerald-400 font-bold">{placedOrder.orderId}</span>
                        <span className="text-[#88889C] ml-2">Just Now · {placedOrder.customer.name}</span>
                        <p className="text-[11px] text-white mt-0.5">
                          {placedOrder.items.length} items (₹{placedOrder.amount}) · {placedOrder.method}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30">
                          {placedOrder.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNotify?.('Dispatched fleet driver for demo order!')}
                          className="px-2.5 py-1 rounded bg-[#D4AF37] text-[#08080A] font-bold text-[10px]"
                        >
                          Dispatch Driver
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-3 flex flex-wrap items-center justify-between gap-3 text-[#A0A0B2]">
                    <div>
                      <span className="font-mono text-white font-medium">ORD-DEMO-9120</span>
                      <span className="ml-2">12 mins ago · Rohan K.</span>
                      <p className="text-[11px] text-[#7C7C90] mt-0.5">2x Dum Biryani Handi (₹998) · UPI</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-500/30">
                      Out for Delivery
                    </span>
                  </div>

                  <div className="p-3 flex flex-wrap items-center justify-between gap-3 text-[#A0A0B2]">
                    <div>
                      <span className="font-mono text-white font-medium">ORD-DEMO-9118</span>
                      <span className="ml-2">35 mins ago · Anita M.</span>
                      <p className="text-[11px] text-[#7C7C90] mt-0.5">1x Galouti Kebabs, 1x Naan (₹829) · Card</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                      Delivered
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TRANSPARENT DOMAIN & DELIVERY ARCHITECTURE EXPLAINER               */}
        {/* ------------------------------------------------------------------ */}
        <div className="rounded-2xl border border-[#2B2B3C] bg-[#0E0E16] p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Globe className="w-5 h-5 text-[#D4AF37]" />
            <h2>Transparent Domain &amp; Customer Website Delivery Architecture</h2>
          </div>
          <p className="text-xs text-[#9E9EB2] max-w-3xl leading-relaxed">
            Vijay Visuals believes in 100% transparency. We never invent fake domain availability or promise features that require manual configuration. This demo shows the intended delivery flow; nothing on this page provisions a domain, certificate, publication, or deployment:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="rounded-xl border border-[#242436] bg-[#111118] p-4 space-y-2">
              <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider block">
                1. Platform Preview Path
              </span>
              <p className="text-xs font-semibold text-white">Preview URL (Not a Published Domain)</p>
              <code className="text-[11px] font-mono text-[#ECC86A] bg-black/40 px-2 py-1 rounded block truncate">
                /site/&lt;your-slug&gt; (platform preview only)
              </code>
              <p className="text-[11px] text-[#7E7E92]">
                This demo publishes nothing. A real delivery URL requires an entitled account, a published website record, and verified DNS/TLS.
              </p>
            </div>

            <div className="rounded-xl border border-[#242436] bg-[#111118] p-4 space-y-2">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                2. Customer-Owned Domain
              </span>
              <p className="text-xs font-semibold text-white">Custom Domain (Not Bundled)</p>
              <code className="text-[11px] font-mono text-blue-300 bg-black/40 px-2 py-1 rounded block truncate">
                https://&lt;your-owned-domain&gt;
              </code>
              <p className="text-[11px] text-[#7E7E92]">
                Requires a domain you own plus verified DNS/HTTPS. No domain is bundled or assumed available.
              </p>
            </div>

            <div className="rounded-xl border border-[#242436] bg-[#111118] p-4 space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                3. Verified Custom Domain
              </span>
              <p className="text-xs font-semibold text-white">Independent Brand Domain</p>
              <code className="text-[11px] font-mono text-emerald-300 bg-black/40 px-2 py-1 rounded block truncate">
                https://www.yourbrand.com
              </code>
              <p className="text-[11px] text-[#7E7E92]">
                You own 100% of your domain. After you configure DNS and certificate issuance succeeds, a verified delivery URL is shown. This demo does not perform either step.
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* PACKAGE SELECTION & DIRECT CALL TO ACTION                          */}
        {/* ------------------------------------------------------------------ */}
        <div className="rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-b from-[#18150C] to-[#0E0E15] p-8 text-center space-y-5">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 uppercase tracking-wider">
            Ready to Launch Your Business?
          </span>
          <h2 className="font-luxury text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Select Your Package &amp; Get Your Custom Store in Minutes
          </h2>
          <p className="text-xs sm:text-sm text-[#A6A6BC] max-w-xl mx-auto">
            Includes multi-lingual storefront (12 Indian languages), integrated inventory, official Cashfree payments, customer support, and automatic pre-change website backups.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onNavigatePlan('website_only_onetime')}
              className="px-6 py-3 rounded-lg bg-gold-gradient text-[#08080A] font-bold text-xs hover:opacity-95 transition-opacity shadow-lg"
            >
              Get Business Website (₹9,439)
            </button>
            <button
              type="button"
              onClick={() => onNavigatePlan('website_plus_pwa_onetime')}
              className="px-6 py-3 rounded-lg border border-[#D4AF37] text-[#ECC86A] font-bold text-xs hover:bg-[#D4AF37]/10 transition-colors"
            >
              Get Website + Mobile PWA (₹27,139)
            </button>
            <button
              type="button"
              onClick={onGoBuilder}
              className="px-6 py-3 rounded-lg border border-[#2B2B3C] text-[#A6A6BC] hover:text-white text-xs font-medium transition-colors"
            >
              Open Website Builder First
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* SLIDE-OVER CART DRAWER                                             */}
      {/* ------------------------------------------------------------------ */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0D0D14] border-l border-[#242436] p-6 flex flex-col justify-between h-full text-xs shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2C]">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#D4AF37]" />
                  <h3 className="font-bold text-sm text-white">Your Demo Cart ({cart.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="p-1 text-[#848496] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="py-16 text-center text-[#7E7E92]">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40 text-[#D4AF37]" />
                  <p>Your cart is empty.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#181824] max-h-[50vh] overflow-y-auto my-4 pr-1">
                  {cart.map((item) => (
                    <div key={item.product.id} className="py-3 flex items-center justify-between gap-3">
                      <img src={item.product.image} alt={item.product.name} width={48} height={48} loading="lazy" decoding="async" className="w-12 h-12 object-cover rounded-md shrink-0" />
                      <div className="flex-1 truncate">
                        <p className="font-semibold text-white truncate">{item.product.name}</p>
                        <p className="text-[11px] text-[#D4AF37] font-mono">₹{item.product.price} each</p>
                      </div>
                      <div className="flex items-center gap-2 bg-[#14141E] p-1 rounded border border-[#242436]">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="p-1 hover:text-[#ECC86A]"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-white px-1">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="p-1 hover:text-[#ECC86A]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-[#1E1E2C]">
                {/* Coupon Code Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 rounded border border-[#282838] bg-[#08080C] px-3 py-1.5 text-xs text-white font-mono uppercase focus:border-[#D4AF37] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (couponCode === 'VIJAY10') {
                        setDiscountApplied(true);
                        onNotify?.('Coupon VIJAY10 applied: 10% discount!');
                      } else {
                        onNotify?.('Invalid coupon. Try VIJAY10');
                      }
                    }}
                    className="px-3 py-1.5 rounded bg-[#1C1C28] text-white hover:bg-[#282838] font-semibold"
                  >
                    Apply
                  </button>
                </div>

                {/* Subtotal Calculation */}
                <div className="space-y-1.5 text-[11px] text-[#A6A6BC]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{subtotal}</span>
                  </div>
                  {discountApplied && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Discount (10% VIJAY10)</span>
                      <span>-₹{discountAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>GST (5% Cloud Kitchen)</span>
                    <span>₹{gstAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Fleet Fee</span>
                    <span>{deliveryFee === 0 ? <span className="text-emerald-400 font-bold">FREE</span> : `₹${deliveryFee}`}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-white pt-2 border-t border-[#20202E]">
                    <span>Total Amount</span>
                    <span className="text-[#D4AF37]">₹{totalAmount}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    setCheckoutModalOpen(true);
                  }}
                  className="w-full py-3 rounded-lg bg-gold-gradient text-[#08080A] font-bold text-xs hover:opacity-95 transition-opacity shadow-lg flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Simulate Checkout (₹{totalAmount})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SIMULATED CHECKOUT MODAL                                           */}
      {/* ------------------------------------------------------------------ */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-[#2B2B3C] bg-[#0E0E16] p-6 text-xs text-[#E1E1EE] shadow-2xl space-y-4">
            <button
              type="button"
              onClick={() => setCheckoutModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-[#8E8EA2] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Safety Warning Banner */}
            <div className="rounded-lg bg-amber-950/40 border border-amber-500/50 p-3 flex items-start gap-2.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-[11px]">Simulated Demo Checkout Only</p>
                <p className="text-[10px] text-amber-200/80 leading-relaxed">
                  This transaction is 100% simulated. Zero real money will be charged. No banking OTP or credit card payment will occur.
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-luxury text-base font-bold text-white">Complete Simulated Order</h3>
              <p className="text-[11px] text-[#8E8EA2]">Delivery to Hyderabad (Estimated 35 mins)</p>
            </div>

            {/* Customer Details Form */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#868698] mb-1">Customer Name</label>
                  <input
                    type="text"
                    defaultValue="Priya Sharma"
                    className="w-full rounded border border-[#282838] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#868698] mb-1">Phone Number</label>
                  <input
                    type="text"
                    defaultValue="+91 98765 43210"
                    className="w-full rounded border border-[#282838] bg-[#08080C] px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#868698] mb-1">Delivery Address</label>
                <input
                  type="text"
                  defaultValue="Flat 402, Lotus Residency, Hitec City, Hyderabad"
                  className="w-full rounded border border-[#282838] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-[10px] text-[#868698] mb-1.5 font-semibold">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'upi', label: 'UPI / QR Code', icon: QrCode },
                  { id: 'card', label: 'Credit / Debit Card', icon: CreditCard },
                  { id: 'cod', label: 'Cash on Delivery', icon: Package },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCheckoutMethod(m.id as any)}
                      className={`p-2 rounded-lg border text-center flex flex-col items-center gap-1 transition-colors ${
                        checkoutMethod === m.id
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-white'
                          : 'border-[#222232] bg-[#111118] text-[#8E8EA2] hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-[10px] font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Simulated UPI QR or Card Info */}
            {checkoutMethod === 'upi' && (
              <div className="rounded-lg border border-[#222232] bg-[#12121A] p-3 text-center space-y-2">
                <p className="text-[11px] text-[#A6A6BC]">Scan with GPay, PhonePe, or Paytm (Simulated)</p>
                <div className="w-24 h-24 mx-auto bg-white p-2 rounded-lg flex items-center justify-center">
                  <QrCode className="w-20 h-20 text-black" />
                </div>
                <p className="font-mono text-[10px] text-[#D4AF37]">upi://pay?pa=royalfeast@icici&amp;am={totalAmount}</p>
              </div>
            )}

            {/* Confirm Simulated Order Button */}
            <button
              type="button"
              onClick={handleSimulateCheckout}
              disabled={simulatingPayment}
              className="w-full py-3 rounded-lg bg-gold-gradient text-[#08080A] font-bold text-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{simulatingPayment ? 'Verifying Simulated Order...' : `Authorize Simulated Payment (₹${totalAmount})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* LOGO STUDIO MODAL                                                  */}
      {/* ------------------------------------------------------------------ */}
      {showLogoStudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl">
            <button
              type="button"
              onClick={() => setShowLogoStudio(false)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-md text-[#8E8EA2] hover:text-white bg-[#1A1A26] border border-[#2B2B3C]"
            >
              <X className="w-4 h-4" />
            </button>
            <CustomerLogoCustomizer
              tenantId="royal-feast-cloud-kitchen"
              tenantName={demoLogo.businessName}
              currentLogo={demoLogo}
              onSaveLogo={(cfg) => {
                setDemoLogo(cfg);
                setShowLogoStudio(false);
                onNotify?.('Demo logo updated! See the storefront header & footer transform.');
              }}
              onNotify={onNotify}
            />
          </div>
        </div>
      )}
    </div>
  );
};
