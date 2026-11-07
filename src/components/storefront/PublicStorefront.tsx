import React, { useState, useEffect } from 'react';
import {
  businessService,
  productService,
  bookingService,
  orderService,
  couponService,
  TEMPLATES_DATA,
  BusinessTenant,
  Product,
  Order
} from '../../lib/supabase';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Check,
  X,
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Calendar,
  Clock,
  Bike,
  ShieldCheck,
  Star,
  ExternalLink,
  Tag,
  ArrowRight
} from 'lucide-react';
import { CONTACT_INFO } from '../../data/content';
import { OrderTrackingModal } from '../tracking/OrderTrackingModal';

interface PublicStorefrontProps {
  siteSlug: string;
  onNavigateHome: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export const PublicStorefront: React.FC<PublicStorefrontProps> = ({
  siteSlug,
  onNavigateHome,
}) => {
  const [business, setBusiness] = useState<BusinessTenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [language, setLanguage] = useState<'en' | 'te' | 'hi'>('en');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);

  // Checkout form
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'success'>('cart');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custNotes, setCustNotes] = useState('');
  const [payMethod, setPayMethod] = useState<'cod' | 'upi' | 'card'>('upi');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  // Booking state (for service businesses)
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingServiceType, setBookingServiceType] = useState('Consultation & Fitting');
  const [bookingDate, setBookingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [bookingTime, setBookingTime] = useState('11:00 AM');
  const [bookingCustName, setBookingCustName] = useState('');
  const [bookingCustPhone, setBookingCustPhone] = useState('');
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  // Tracking modal
  const [showTracking, setShowTracking] = useState(false);

  useEffect(() => {
    // Find business by slug
    const found = businessService.getBusinessBySlug(siteSlug) || businessService.getAllBusinesses()[0];
    if (found) {
      setBusiness(found);
      const prods = productService.getProductsByBusiness(found.id);
      setProducts(prods);
    }
  }, [siteSlug]);

  if (!business) {
    return (
      <div className="min-h-screen bg-[#08080A] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-[#1A1A24] border border-[#2D2D3E] flex items-center justify-center text-[#DFBA5A] mb-4">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-luxury">Storefront Not Found</h2>
        <p className="text-xs text-[#8A8A9C] mt-2 max-w-sm">
          No published storefront found for slug "{siteSlug}". It may still be in draft mode or unpublished.
        </p>
        <button
          onClick={onNavigateHome}
          className="mt-6 px-4 py-2 rounded-lg bg-[#DFBA5A] text-[#0A0A0E] text-xs font-bold"
        >
          Return to Vijay Visuals Home
        </button>
      </div>
    );
  }

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discountAmount = appliedDiscount ? appliedDiscount.amount : 0;
  const deliveryFee = subtotal > 1500 ? 0 : 50;
  const gstAmount = Math.round((subtotal - discountAmount) * 0.05); // 5% GST
  const grandTotal = Math.max(0, subtotal - discountAmount + deliveryFee + gstAmount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    const res = couponService.validateCoupon(couponCode.trim(), business.id, subtotal);
    if (res.valid) {
      setAppliedDiscount({ code: couponCode.toUpperCase(), amount: res.discountAmount });
    } else {
      alert(res.message);
    }
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPhone.trim() || !custAddress.trim()) {
      alert('Please fill out your delivery details.');
      return;
    }

    const newOrder = orderService.createOrder({
      business_id: business.id,
      business_name: business.business_name,
      customer_name: custName,
      customer_email: `${custPhone}@order.customer`,
      customer_phone: custPhone,
      delivery_address: custAddress,
      delivery_city: business.city || 'Hyderabad',
      items: cart.map((c) => ({
        id: c.product.id,
        name: c.product.name,
        quantity: c.quantity,
        price: c.product.price,
      })),
      total_amount: grandTotal,
      payment_method: payMethod === 'card' ? 'razorpay' : payMethod,
      payment_status: 'pending',
      order_status: 'placed',
      delivery_notes: custNotes,
    });

    setPlacedOrder(newOrder);
    setCheckoutStep('success');
    setCart([]);
  };

  const handleServiceBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingCustName.trim() || !bookingCustPhone.trim()) {
      alert('Please enter your name and phone number.');
      return;
    }

    const res = bookingService.createBooking({
      business_id: business.id,
      customer_name: bookingCustName,
      customer_email: `${bookingCustPhone}@booking.customer`,
      customer_phone: bookingCustPhone,
      service_name: bookingServiceType,
      booking_date: bookingDate,
      time_slot: bookingTime,
      advance_paid: 500,
      total_amount: 2500,
      status: 'confirmed',
    });

    if (res.success) {
      setBookingConfirmed(true);
    } else {
      alert(res.error || 'This time slot is already booked. Please choose another.');
    }
  };

  // Filter products
  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category)))];
  const filteredProducts = products.filter((p) => {
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    const matchSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="min-h-screen bg-[#07070A] text-[#E8E8ED] font-sans antialiased flex flex-col justify-between">
      {/* Platform Top Notification Bar */}
      <div className="bg-[#12121D] border-b border-[#212130] py-2 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse"></span>
            <span className="text-[#88889C]">
              Live Storefront hosted on{' '}
              <strong className="text-[#DFBA5A]">VIJAY VISUALS Multi-Tenant SaaS</strong>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 text-[11px]">
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-0.5 rounded ${
                  language === 'en' ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold' : 'text-[#88889C]'
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage('te')}
                className={`px-2 py-0.5 rounded ${
                  language === 'te' ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold' : 'text-[#88889C]'
                }`}
              >
                తెలుగు
              </button>
              <button
                onClick={() => setLanguage('hi')}
                className={`px-2 py-0.5 rounded ${
                  language === 'hi' ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold' : 'text-[#88889C]'
                }`}
              >
                हिन्दी
              </button>
            </div>

            <button
              onClick={onNavigateHome}
              className="text-[#DFBA5A] hover:underline font-semibold flex items-center gap-1 text-[11px]"
            >
              <span>Explore Platform</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Store Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A10]/95 backdrop-blur-md border-b border-[#1E1E2C] py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] font-luxury font-black text-sm shadow-md">
              {business.business_name.charAt(0)}
            </span>
            <div>
              <h1 className="font-luxury font-bold text-white text-base tracking-wider">
                {business.business_name}
              </h1>
              <p className="text-[11px] text-[#848496]">
                {business.category} · Express 30-min Delivery
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTracking(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141420] text-xs text-[#8A8A9E] hover:text-[#DFBA5A] border border-[#222230]"
            >
              <Bike className="w-3.5 h-3.5 text-[#DFBA5A]" />
              <span>Track Order</span>
            </button>

            <button
              onClick={() => setIsBookingOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171A24] text-xs text-white hover:border-[#DFBA5A] border border-[#282C3D]"
            >
              <Calendar className="w-3.5 h-3.5 text-[#DFBA5A]" />
              <span>Book Appointment</span>
            </button>

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold flex items-center gap-2 shadow-md shadow-[#DFBA5A]/20 hover:brightness-110"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Cart</span>
              {totalItemCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#0A0A0E] text-[#DFBA5A] text-[10px] font-black flex items-center justify-center">
                  {totalItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full space-y-8">
        {/* Hero Banner */}
        <div className="relative rounded-3xl p-8 sm:p-12 overflow-hidden border border-[#26263A] bg-gradient-to-r from-[#12121C] via-[#0E0E18] to-[#161410]">
          <div className="max-w-2xl relative z-10 space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#241E10] border border-[#DFBA5A]/30 text-[#DFBA5A] text-xs font-mono">
              <Star className="w-3 h-3 fill-[#DFBA5A]" />
              <span>
                {language === 'te'
                  ? 'ధృవీకరించబడిన స్టోర్'
                  : language === 'hi'
                  ? 'सत्यापित प्रीमियम स्टोर'
                  : 'Official Verified Merchant Store'}
              </span>
            </span>

            <h2 className="font-luxury text-3xl sm:text-4xl font-bold text-white tracking-wide leading-tight">
              {business.business_name}
            </h2>

            <p className="text-sm text-[#A0A0B2] leading-relaxed">
              {language === 'te'
                ? 'ప్రీమియం నాణ్యత ఉత్పత్తులు మరియు ఎక్స్‌ప్రెస్ హోమ్ డెలివరీ. సురక్షిత చెల్లింపులు మరియు తక్షణ వాట్సాప్ ఆర్డర్‌లు.'
                : language === 'hi'
                ? 'प्रीमियम गुणवत्ता उत्पाद और एक्सप्रेस होम डिलीवरी। सुरक्षित भुगतान और त्वरित व्हाट्सएप ऑर्डर।'
                : 'Experience premier craftsmanship, authentic collections, and door-to-door express city fulfillment with contactless verification.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(
                  `Hello ${business.business_name}, I am browsing your online catalog and would like to inquire about products.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#152418] hover:bg-[#1C3321] text-[#25D366] text-xs font-bold border border-[#25D366]/40"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Chat on WhatsApp</span>
              </a>

              <button
                onClick={() => setIsBookingOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#181826] hover:bg-[#202034] text-xs font-semibold text-white border border-[#2C2C3E]"
              >
                Schedule Visit / Appointment
              </button>
            </div>
          </div>
        </div>

        {/* Product Catalog Section */}
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-luxury text-xl font-bold text-white">Featured Catalog</h3>
              <p className="text-xs text-[#828294]">
                {filteredProducts.length} items available for immediate dispatch
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-xs sm:max-w-md">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                      activeCategory === cat
                        ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold'
                        : 'bg-[#12121D] text-[#868698] hover:text-white border border-[#202030]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#646476]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-[#12121D] border border-[#202030] text-xs text-white placeholder-[#5A5A6C] focus:outline-none focus:border-[#DFBA5A] w-36 sm:w-44"
                />
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-[#0F0F17] border border-[#1F1F2E] hover:border-[#DFBA5A]/40 rounded-2xl overflow-hidden flex flex-col justify-between group transition-all"
              >
                <div>
                  <div className="relative h-44 bg-[#141420] overflow-hidden">
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-2.5 right-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-black/75 text-[#DFBA5A] border border-[#DFBA5A]/30">
                      {p.category}
                    </span>
                    {p.stock < 5 && p.stock > 0 && (
                      <span className="absolute bottom-2.5 left-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-[#331114] text-[#FF8585] border border-[#551A20]">
                        Only {p.stock} left
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-1.5">
                    <h4 className="font-semibold text-white text-sm group-hover:text-[#DFBA5A] transition-colors line-clamp-1">
                      {p.name}
                    </h4>
                    <p className="text-xs text-[#808092] line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div className="p-4 pt-0 border-t border-[#1A1A26] mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-[#6A6A7C] block">Price</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">₹{p.price.toLocaleString()}</span>
                      {p.compare_price && p.compare_price > p.price && (
                        <span className="text-xs text-[#626274] line-through">
                          ₹{p.compare_price.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => addToCart(p)}
                    className="px-3 py-1.5 rounded-lg bg-[#181828] hover:bg-[#DFBA5A] text-white hover:text-[#0A0A0E] text-xs font-semibold border border-[#2D2D40] hover:border-[#DFBA5A] transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0D0D15] border-l border-[#222234] h-full flex flex-col justify-between p-6 overflow-y-auto">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#1E1E2C] pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#DFBA5A]" />
                  <h3 className="font-luxury text-lg font-bold text-white">Your Shopping Cart</h3>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="text-[#808092] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {checkoutStep === 'cart' && (
                <>
                  {cart.length === 0 ? (
                    <div className="py-16 text-center text-[#707082] space-y-2">
                      <ShoppingBag className="w-10 h-10 mx-auto text-[#404050]" />
                      <p className="text-xs">Your shopping cart is currently empty.</p>
                      <button
                        onClick={() => setIsCartOpen(false)}
                        className="px-4 py-2 rounded-lg bg-[#1A1A28] text-xs text-[#DFBA5A]"
                      >
                        Browse Products
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div
                          key={item.product.id}
                          className="p-3 rounded-xl bg-[#12121E] border border-[#1E1E2E] flex items-center justify-between gap-3"
                        >
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-12 h-12 rounded-lg object-cover bg-[#1B1B2A] shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h5 className="text-xs font-bold text-white truncate">
                              {item.product.name}
                            </h5>
                            <span className="text-xs text-[#DFBA5A] font-semibold">
                              ₹{item.product.price.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-[#1A1A28] px-2 py-1 rounded-lg border border-[#28283C]">
                            <button
                              onClick={() => updateQuantity(item.product.id, -1)}
                              className="text-[#88889C] hover:text-white"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-mono font-bold w-4 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.product.id, 1)}
                              className="text-[#88889C] hover:text-white"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Coupon input */}
                      <form onSubmit={handleApplyCoupon} className="pt-2 flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          placeholder="Coupon Code (e.g. VIJAY10, FESTIVE20)"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-[#141420] border border-[#26263A] text-xs text-white placeholder-[#5A5A6C] focus:outline-none focus:border-[#DFBA5A]"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-[#1E1E2E] text-xs font-semibold text-[#DFBA5A] hover:bg-[#28283E]"
                        >
                          Apply
                        </button>
                      </form>

                      {appliedDiscount && (
                        <div className="p-2 rounded-lg bg-[#142618] border border-[#264D2E] text-[11px] text-[#25D366] flex items-center justify-between">
                          <span>Discount code {appliedDiscount.code} applied!</span>
                          <span>-₹{appliedDiscount.amount}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {checkoutStep === 'details' && (
                <form onSubmit={handlePlaceOrder} className="space-y-3.5">
                  <h4 className="text-xs uppercase font-mono tracking-widest text-[#828294]">
                    Delivery Details
                  </h4>
                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Your Full Name *</label>
                    <input
                      type="text"
                      required
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-xs text-white placeholder-[#505060] focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Mobile Number (for OTP & Delivery) *</label>
                    <input
                      type="tel"
                      required
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-xs text-white placeholder-[#505060] focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Complete Delivery Address *</label>
                    <textarea
                      required
                      rows={2}
                      value={custAddress}
                      onChange={(e) => setCustAddress(e.target.value)}
                      placeholder="Flat/House No., Street, Landmark, City & Pincode"
                      className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-xs text-white placeholder-[#505060] focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMethod('upi')}
                        className={`p-2 rounded-lg text-xs font-semibold border ${
                          payMethod === 'upi'
                            ? 'bg-[#2B2312] border-[#DFBA5A] text-[#DFBA5A]'
                            : 'bg-[#141420] border-[#222230] text-[#78788C]'
                        }`}
                      >
                        UPI / QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('cod')}
                        className={`p-2 rounded-lg text-xs font-semibold border ${
                          payMethod === 'cod'
                            ? 'bg-[#2B2312] border-[#DFBA5A] text-[#DFBA5A]'
                            : 'bg-[#141420] border-[#222230] text-[#78788C]'
                        }`}
                      >
                        Cash on Del.
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('card')}
                        className={`p-2 rounded-lg text-xs font-semibold border ${
                          payMethod === 'card'
                            ? 'bg-[#2B2312] border-[#DFBA5A] text-[#DFBA5A]'
                            : 'bg-[#141420] border-[#222230] text-[#78788C]'
                        }`}
                      >
                        Card / Net
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('cart')}
                      className="w-1/3 py-2.5 rounded-xl bg-[#1C1C28] text-xs font-semibold text-[#808092]"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider hover:brightness-110"
                    >
                      Confirm Order
                    </button>
                  </div>
                </form>
              )}

              {checkoutStep === 'success' && placedOrder && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-[#18331F] border border-[#25D366]/40 flex items-center justify-center text-[#25D366] mx-auto">
                    <Check className="w-7 h-7" />
                  </div>
                  <h4 className="font-luxury text-xl font-bold text-white">Order Confirmed!</h4>
                  <p className="text-xs text-[#8E8EA0] max-w-xs mx-auto">
                    Thank you! Your order has been dispatched to the kitchen / store and assigned to our delivery fleet.
                  </p>

                  <div className="p-3.5 rounded-xl bg-[#141420] border border-[#242436] text-left space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#727284]">Order Number:</span>
                      <span className="font-mono font-bold text-[#DFBA5A]">{placedOrder.order_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#727284]">Amount:</span>
                      <span className="font-bold text-white">₹{placedOrder.total_amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#727284]">Delivery Status:</span>
                      <span className="text-[#25D366] uppercase font-mono text-[10px]">Processing</span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setShowTracking(true);
                        setIsCartOpen(false);
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#1C1810] border border-[#DFBA5A]/40 text-[#DFBA5A] text-xs font-bold flex items-center justify-center gap-2"
                    >
                      <Bike className="w-4 h-4" />
                      <span>Track Order Live (11 Stages)</span>
                    </button>

                    <a
                      href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(
                        `Hi ${business.business_name}, I just placed order ${placedOrder.order_number} for ₹${placedOrder.total_amount}. Please confirm delivery timing!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl bg-[#152418] text-[#25D366] text-xs font-bold flex items-center justify-center gap-2 border border-[#25D366]/40"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Confirm on WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Footer Summary */}
            {checkoutStep === 'cart' && cart.length > 0 && (
              <div className="border-t border-[#1E1E2C] pt-4 space-y-2.5">
                <div className="flex justify-between text-xs text-[#828294]">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toLocaleString()}</span>
                </div>
                {appliedDiscount && (
                  <div className="flex justify-between text-xs text-[#25D366]">
                    <span>Discount</span>
                    <span>-₹{discountAmount}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-[#828294]">
                  <span>Delivery Fee</span>
                  <span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
                </div>
                <div className="flex justify-between text-xs text-[#828294]">
                  <span>GST (5%)</span>
                  <span>₹{gstAmount}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-[#1C1C28]">
                  <span>Total Payable</span>
                  <span className="text-[#DFBA5A]">₹{grandTotal.toLocaleString()}</span>
                </div>

                <button
                  onClick={() => setCheckoutStep('details')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider hover:brightness-110 mt-2 flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Appointment Booking Modal */}
      {isBookingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#0D0D14] border border-[#28283C] rounded-2xl p-6 sm:p-8 shadow-2xl">
            <button
              onClick={() => {
                setIsBookingOpen(false);
                setBookingConfirmed(false);
              }}
              className="absolute top-5 right-5 text-[#88889C] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-[#1E1E2C] pb-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#171724] border border-[#DFBA5A]/30 flex items-center justify-center text-[#DFBA5A]">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury text-lg font-bold text-white">Book Appointment</h3>
                <p className="text-xs text-[#808092]">Anti-double-booking verified scheduling</p>
              </div>
            </div>

            {bookingConfirmed ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#18331F] text-[#25D366] flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-base">Appointment Reserved!</h4>
                <p className="text-xs text-[#8E8EA0]">
                  Your appointment for <strong>{bookingServiceType}</strong> on <strong>{bookingDate}</strong> at <strong>{bookingTime}</strong> has been secured.
                </p>
                <button
                  onClick={() => {
                    setIsBookingOpen(false);
                    setBookingConfirmed(false);
                  }}
                  className="mt-4 px-6 py-2 rounded-xl bg-[#1C1C28] text-xs font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleServiceBooking} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-[11px] text-[#868698] block mb-1">Service Type</label>
                  <select
                    value={bookingServiceType}
                    onChange={(e) => setBookingServiceType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-white focus:outline-none focus:border-[#DFBA5A]"
                  >
                    <option value="Consultation & Fitting">Consultation & Fitting</option>
                    <option value="Custom Design Consultation">Custom Design Consultation</option>
                    <option value="Private Studio VIP Tour">Private Studio VIP Tour</option>
                    <option value="Express Home Appraisal">Express Home Appraisal</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-white focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#868698] block mb-1">Time Slot</label>
                    <select
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-white focus:outline-none focus:border-[#DFBA5A]"
                    >
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="11:00 AM">11:00 AM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="04:00 PM">04:00 PM</option>
                      <option value="06:00 PM">06:00 PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#868698] block mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={bookingCustName}
                    onChange={(e) => setBookingCustName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-white focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[#868698] block mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={bookingCustPhone}
                    onChange={(e) => setBookingCustPhone(e.target.value)}
                    placeholder="+91 9381362201"
                    className="w-full px-3 py-2 rounded-lg bg-[#141420] border border-[#26263A] text-white focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBookingOpen(false)}
                    className="px-4 py-2 rounded-lg bg-[#181824] text-[#808092]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] font-bold uppercase tracking-wider hover:brightness-110"
                  >
                    Confirm Booking
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Real-time Order Tracking Modal */}
      <OrderTrackingModal
        isOpen={showTracking}
        initialOrderNumber={placedOrder?.order_number}
        onClose={() => setShowTracking(false)}
      />

      {/* Storefront Footer */}
      <footer className="bg-[#050508] border-t border-[#1C1C24] py-8 text-xs text-[#7A7A8C]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} {business.business_name}. Powered by VIJAY VISUALS Multi-Tenant SaaS Platform.</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowTracking(true)} className="hover:text-white">
              Track An Order
            </button>
            <button onClick={onNavigateHome} className="text-[#DFBA5A] hover:underline">
              Build Your Own Store with VIJAY VISUALS
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
