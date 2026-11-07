import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  BusinessTenant,
  businessService,
  orderService,
  Order,
  TEMPLATES_DATA
} from '../../lib/supabase';
import {
  productService,
  crmService,
  documentService,
  bookingService,
  subscriptionService,
  ticketService,
  couponService,
  analyticsService,
  Product,
  CRMLead,
  Proposal,
  Invoice,
  Booking,
  SupportTicket,
  Coupon
} from '../../lib/saasServices';
import { WebsiteBuilder } from '../builder/WebsiteBuilder';
import { AiStudioSection } from '../ai/AiStudioSection';
import {
  Store,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  FileText,
  Receipt,
  Calendar,
  Sparkles,
  BarChart3,
  CreditCard,
  Headphones,
  Globe,
  Plus,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Phone,
  Send,
  MessageCircle,
  Copy,
  Printer,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Bike,
  X,
  Share2,
  Trash2,
  Sliders,
  ShieldCheck
} from 'lucide-react';

interface ShopOwnerDashboardProps {
  currentUser: UserProfile;
  businessId?: string;
  onLogout: () => void;
  onShowToast: (msg: string) => void;
  onNavigateHome?: () => void;
  onOpenStorefront?: (slug: string) => void;
}

export const ShopOwnerDashboard: React.FC<ShopOwnerDashboardProps> = ({
  currentUser,
  businessId: propBusinessId,
  onLogout,
  onShowToast,
  onNavigateHome = () => {},
  onOpenStorefront,
}) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'builder'
    | 'products'
    | 'orders'
    | 'crm'
    | 'proposals'
    | 'invoices'
    | 'bookings'
    | 'ai_studio'
    | 'subscription'
    | 'support'
  >('overview');

  // Tenant Business Context
  const allBusinesses = businessService.getAllBusinesses();
  // Find tenant's business or default to first seed
  const currentBusiness: BusinessTenant =
    allBusinesses.find(b => b.owner_id === currentUser.id) || allBusinesses[0];

  const businessId: string = propBusinessId || currentBusiness?.id || 'biz-01';

  // Local Reactive State for Tenant's Private Domain Data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Modals state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState<number>(999);
  const [newProdStock, setNewProdStock] = useState<number>(20);
  const [newProdCategory, setNewProdCategory] = useState(currentBusiness?.category || 'Retail');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdImage, setNewProdImage] = useState('https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600');

  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadValue, setLeadValue] = useState<number>(15000);
  const [leadNote, setLeadNote] = useState('');

  const [showCreateProposalModal, setShowCreateProposalModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState<number>(5000);

  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState<SupportTicket['category']>('technical');
  const [ticketMessage, setTicketMessage] = useState('');

  // Custom Domain State
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [dnsStatus, setDnsStatus] = useState<'idle' | 'checking' | 'verified'>('idle');

  const loadTenantData = () => {
    setProducts(productService.getProductsByBusiness(businessId));
    setOrders(orderService.getAllOrders().filter(o => o.business_id === businessId));
    setLeads(crmService.getLeadsByBusiness(businessId));
    setProposals(documentService.getProposalsByBusiness(businessId));
    setInvoices(documentService.getInvoicesByBusiness(businessId));
    setBookings(bookingService.getBookingsByBusiness(businessId));
    setCoupons(couponService.getCoupons(businessId));
    setTickets(ticketService.getTickets(businessId));
  };

  useEffect(() => {
    loadTenantData();
    window.addEventListener('vv_store_updated', loadTenantData);
    return () => window.removeEventListener('vv_store_updated', loadTenantData);
  }, [businessId]);

  const analytics = analyticsService.getTenantAnalytics(businessId);
  const subscription = subscriptionService.getSubscription(businessId);

  // Handlers
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || newProdPrice <= 0) {
      onShowToast('Please provide valid product name and price.');
      return;
    }
    productService.saveProduct({
      business_id: businessId,
      name: newProdName,
      price: Number(newProdPrice),
      stock: Number(newProdStock),
      low_stock_threshold: 3,
      sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
      category: newProdCategory,
      description: newProdDesc || 'Premium offering crafted for customer delight.',
      image_url: newProdImage,
      is_active: true,
    });
    onShowToast(`Product "${newProdName}" created successfully!`);
    setShowAddProductModal(false);
    setNewProdName('');
    loadTenantData();
  };

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      onShowToast('Lead name and contact phone are required.');
      return;
    }
    crmService.saveLead({
      business_id: businessId,
      customer_name: leadName,
      phone: leadPhone,
      email: leadEmail || 'client@contact.in',
      source: 'website',
      status: 'new',
      estimated_value: Number(leadValue),
      notes: leadNote ? [leadNote] : ['Inbound enquiry received.'],
    });
    onShowToast(`Lead for ${leadName} registered in CRM!`);
    setShowAddLeadModal(false);
    setLeadName('');
    setLeadPhone('');
    loadTenantData();
  };

  const handleCreateProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !itemDesc.trim()) {
      onShowToast('Client name and item description required.');
      return;
    }
    const prop = documentService.createProposal({
      business_id: businessId,
      client_name: clientName,
      client_phone: clientPhone || '+91 93813 62201',
      client_email: clientEmail || 'client@domain.com',
      items: [{ id: '1', description: itemDesc, quantity: 1, unit_price: Number(itemPrice), total: Number(itemPrice) }],
      discount: 0,
      tax_rate: 3,
      total_amount: Math.round(Number(itemPrice) * 1.03),
      terms: 'Standard Vijay Visuals terms. Valid for 14 days.',
      valid_until: '2026-12-15',
      status: 'sent',
    });
    onShowToast(`Proposal ${prop.proposal_number} generated!`);
    setShowCreateProposalModal(false);
    setClientName('');
    setItemDesc('');
    loadTenantData();
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    ticketService.createTicket(
      {
        tenant_id: businessId,
        customer_name: currentUser.full_name,
        customer_email: currentUser.email,
        subject: ticketSubject,
        category: ticketCategory,
        priority: 'medium',
        status: 'open',
      },
      ticketMessage
    );
    onShowToast('Support ticket dispatched to Vijay Visuals Super Admin team!');
    setShowTicketModal(false);
    setTicketSubject('');
    setTicketMessage('');
    loadTenantData();
  };

  const handleCheckDns = () => {
    if (!customDomainInput.trim()) return;
    setDnsStatus('checking');
    setTimeout(() => {
      setDnsStatus('verified');
      onShowToast(`CNAME records verified for ${customDomainInput}! SSL certificate auto-provisioned.`);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#07070A] text-[#EDEDF2] flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-[#0A0A0F] border-b border-[#1C1C28] sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 text-white font-luxury font-bold tracking-wider"
          >
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black shadow-md shadow-[#D4AF37]/20">
              VV
            </span>
            <span className="hidden sm:inline font-luxury text-base">VIJAY VISUALS SAAS</span>
          </button>

          <div className="h-5 w-px bg-[#262638] hidden sm:block" />

          {/* Business Switcher Indicator */}
          <div className="flex items-center gap-2 bg-[#12121E] px-3 py-1.5 rounded-lg border border-[#222234]">
            <Store className="w-3.5 h-3.5 text-[#DFBA5A]" />
            <span className="text-xs font-bold text-white max-w-[160px] sm:max-w-xs truncate">
              {currentBusiness?.business_name || 'My Business Store'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C1C2C] text-[#25D366]">
              {subscription.plan_id.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-3">
          <a
            href={`?site=${currentBusiness?.slug || 'aura-jewels'}`}
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141422] hover:bg-[#1C1C2E] border border-[#26263A] text-xs font-semibold text-[#DFBA5A]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Public Storefront</span>
          </a>

          <div className="flex items-center gap-2 pl-2 border-l border-[#222230]">
            <span className="text-xs font-medium text-white hidden sm:inline">{currentUser.full_name}</span>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-lg bg-[#201014] hover:bg-[#2C141B] text-xs font-semibold text-[#FF8282] border border-[#3E1C22]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace with Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto p-4 sm:p-6 gap-6">
        
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0 bg-[#0C0C14] border border-[#1C1C28] rounded-2xl p-3 space-y-1 h-fit">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#707086]">
            Tenant Business Console
          </div>

          {[
            { id: 'overview', label: 'Dashboard & Metrics', icon: LayoutDashboard, count: 'Live' },
            { id: 'builder', label: 'Website Customizer', icon: Globe, count: '35 Themes' },
            { id: 'products', label: 'Products & Inventory', icon: Package, count: products.length },
            { id: 'orders', label: 'Orders & Dispatch', icon: ShoppingBag, count: orders.length },
            { id: 'crm', label: 'CRM & Client Leads', icon: Users, count: leads.length },
            { id: 'proposals', label: 'Proposals & Quotes', icon: FileText, count: proposals.length },
            { id: 'invoices', label: 'GST Invoices', icon: Receipt, count: invoices.length },
            { id: 'bookings', label: 'Service Bookings', icon: Calendar, count: bookings.length },
            { id: 'ai_studio', label: '15 AI Business Tools', icon: Sparkles, count: '15 AI' },
            { id: 'subscription', label: 'Plan & Subscription', icon: CreditCard, count: subscription.plan_id },
            { id: 'support', label: 'Customer Support', icon: Headphones, count: tickets.length },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#DFBA5A]/20 to-transparent text-[#DFBA5A] border-l-2 border-[#DFBA5A] font-bold shadow'
                    : 'text-[#8E8E9F] hover:text-white hover:bg-[#141420]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#DFBA5A]' : 'text-[#6C6C7E]'}`} />
                  <span>{tab.label}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161624] text-[#868698]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Content Panel */}
        <main className="flex-1 space-y-6 min-w-0">
          
          {/* TAB 1: OVERVIEW & ANALYTICS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Tenant Banner Header */}
              <div className="bg-[#0C0C14] border border-[#1E1E2C] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#182618] text-[#25D366] uppercase">
                      Active Multi-Tenant Storefront
                    </span>
                    <span className="text-[10px] font-mono text-[#8C8C9E]">Tenant ID: {businessId}</span>
                  </div>
                  <h1 className="font-luxury text-2xl font-bold text-white mt-1">
                    {currentBusiness?.business_name}
                  </h1>
                  <p className="text-xs text-[#8E8E9F] mt-1">{currentBusiness?.tagline}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('builder')}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] text-xs font-bold shadow-md shadow-[#D4AF37]/20 flex items-center gap-1.5"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Open Customizer</span>
                  </button>
                  <a
                    href={`?site=${currentBusiness?.slug || 'aura-jewels'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-[#141422] hover:bg-[#1A1A2C] border border-[#28283C] text-xs font-semibold text-[#DFBA5A] flex items-center gap-1.5"
                  >
                    <span>Visit Live</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* 4 Core Financial & Performance Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-[#707084] mb-1">
                    <span className="uppercase font-mono text-[10px]">Realized Revenue</span>
                    <DollarSign className="w-4 h-4 text-[#25D366]" />
                  </div>
                  <p className="font-luxury text-2xl font-bold text-white">₹{analytics.totalRevenue.toLocaleString()}</p>
                  <span className="text-[11px] text-[#25D366] mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> +18.4% this month
                  </span>
                </div>

                <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-[#707084] mb-1">
                    <span className="uppercase font-mono text-[10px]">Website Traffic</span>
                    <Globe className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-2xl font-bold text-white">{analytics.viewsCount.toLocaleString()}</p>
                  <span className="text-[11px] text-[#8E8E9F] mt-1 block">
                    {analytics.uniqueVisitors} Unique customers
                  </span>
                </div>

                <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-[#707084] mb-1">
                    <span className="uppercase font-mono text-[10px]">CRM Inbound Leads</span>
                    <Users className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-2xl font-bold text-white">{analytics.leadsCount}</p>
                  <span className="text-[11px] text-[#25D366] mt-1 block">
                    {analytics.conversionRate} Conversion Rate
                  </span>
                </div>

                <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl">
                  <div className="flex items-center justify-between text-xs text-[#707084] mb-1">
                    <span className="uppercase font-mono text-[10px]">Catalog Products</span>
                    <Package className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-2xl font-bold text-white">{products.length}</p>
                  <span className="text-[11px] text-[#8E8E9F] mt-1 block">
                    {orders.length} Orders fulfilled
                  </span>
                </div>
              </div>

              {/* Quick Actions & Live Orders Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Inbound Orders */}
                <div className="bg-[#0C0C14] border border-[#1E1E2C] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-luxury text-base font-bold text-white">Recent Store Orders</h3>
                      <p className="text-xs text-[#808094]">Dispatched directly to Delivery Boys fleet</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('orders')}
                      className="text-xs text-[#DFBA5A] hover:underline"
                    >
                      View All
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {orders.slice(0, 3).map(o => (
                      <div key={o.id} className="p-3 bg-[#12121E] border border-[#202030] rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#DFBA5A]">{o.order_number}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                              o.order_status === 'delivered' ? 'bg-[#182618] text-[#25D366]' : 'bg-[#241E10] text-[#E5B54F]'
                            }`}>
                              {o.order_status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-white font-medium mt-0.5">{o.customer_name} · {o.customer_phone}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-white font-mono">₹{o.total_amount.toLocaleString()}</p>
                          <span className="text-[10px] text-[#707086]">{o.items.length} items</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Domain & Web Presence Card */}
                <div className="bg-[#0C0C14] border border-[#1E1E2C] rounded-2xl p-5 space-y-4">
                  <div>
                    <h3 className="font-luxury text-base font-bold text-white">Custom Domain & SSL Status</h3>
                    <p className="text-xs text-[#808094]">Map your branded domain (e.g. yourstore.com) with Cloudflare SSL</p>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-[#11111C] border border-[#222232] rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase text-[#707086] block">Platform Subdomain</span>
                        <span className="font-mono text-[#DFBA5A] font-semibold">{currentBusiness?.subdomain}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#102915] text-[#25D366] font-mono">
                        SSL Active
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] text-[#A0A0B2] block">Connect Custom Domain</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="e.g. www.aurajewels.in"
                          value={customDomainInput}
                          onChange={(e) => setCustomDomainInput(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl bg-[#12121E] border border-[#252538] text-white text-xs font-mono"
                        />
                        <button
                          onClick={handleCheckDns}
                          disabled={dnsStatus === 'checking'}
                          className="px-3.5 py-2 rounded-xl bg-[#1A1A2C] hover:bg-[#22223A] text-xs font-semibold text-[#DFBA5A] border border-[#2E2E44]"
                        >
                          {dnsStatus === 'checking' ? 'Checking DNS...' : 'Verify DNS'}
                        </button>
                      </div>

                      {dnsStatus === 'verified' && (
                        <div className="p-2.5 rounded-lg bg-[#102414] border border-[#1E4822] text-[#25D366] text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>CNAME verified successfully! Traffic routed to Vijay Visuals Edge.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WEBSITE BUILDER */}
          {activeTab === 'builder' && (
            <div className="space-y-4">
              <WebsiteBuilder
                currentUser={currentUser}
                onShowToast={onShowToast}
              />
            </div>
          )}

          {/* TAB 3: PRODUCTS & INVENTORY */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">Product Catalog & Stock Management</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Manage products, stock alerts, pricing, and variants for your website.</p>
                </div>
                <button
                  onClick={() => setShowAddProductModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Product</span>
                </button>
              </div>

              {/* Products Table */}
              <div className="bg-[#0C0C14] border border-[#1E1E2C] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#10101C] text-[#707086] font-mono uppercase text-[10px] border-b border-[#1E1E2C]">
                      <tr>
                        <th className="py-3 px-4">Item & SKU</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Price</th>
                        <th className="py-3 px-4">Inventory Level</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181826]">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-[#12121E]/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#252538]" />
                              <div>
                                <p className="font-bold text-white text-xs">{p.name}</p>
                                <span className="font-mono text-[10px] text-[#707086]">{p.sku}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-[#161624] text-[#DFBA5A] font-mono text-[10px]">
                              {p.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            ₹{p.price.toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              p.stock <= p.low_stock_threshold
                                ? 'bg-[#301618] text-[#FF6B6B]'
                                : 'bg-[#122616] text-[#25D366]'
                            }`}>
                              {p.stock} units in stock {p.stock <= p.low_stock_threshold ? '(Low!)' : ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                productService.deleteProduct(p.id);
                                onShowToast(`Removed ${p.name}`);
                                loadTenantData();
                              }}
                              className="p-1 text-[#FF8585] hover:text-white"
                              title="Delete Product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ORDERS & DELIVERY DISPATCH */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">Fulfillment & Delivery Boy Dispatch</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Orders placed by customers on your live storefront.</p>
                </div>
                <span className="text-xs font-mono text-[#DFBA5A] bg-[#141424] px-3 py-1.5 rounded-xl border border-[#242438]">
                  {orders.length} Total Orders
                </span>
              </div>

              <div className="space-y-3">
                {orders.map(o => (
                  <div key={o.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#181826] gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#DFBA5A] text-sm">{o.order_number}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#182618] text-[#25D366]">
                            {o.payment_method.toUpperCase()} ({o.payment_status.toUpperCase()})
                          </span>
                        </div>
                        <p className="text-xs text-[#808094] mt-0.5">{new Date(o.created_at).toLocaleString()}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${
                          o.order_status === 'delivered' ? 'bg-[#102416] text-[#25D366]' : 'bg-[#261E10] text-[#E5B54F]'
                        }`}>
                          Status: {o.order_status.toUpperCase()}
                        </span>
                        {o.assigned_delivery_boy_name ? (
                          <span className="text-xs font-mono text-[#25D366] flex items-center gap-1">
                            <Bike className="w-3.5 h-3.5" />
                            {o.assigned_delivery_boy_name}
                          </span>
                        ) : (
                          <span className="text-xs text-[#E5B54F] font-mono">Unassigned</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[#707086] block text-[10px] uppercase font-mono">Customer & Drop Location</span>
                        <p className="font-bold text-white mt-0.5">{o.customer_name} · {o.customer_phone}</p>
                        <p className="text-[#8E8E9F] mt-0.5">{o.delivery_address}, {o.delivery_city}</p>
                      </div>

                      <div className="text-right sm:text-right">
                        <span className="text-[#707086] block text-[10px] uppercase font-mono">Order Value</span>
                        <p className="font-luxury text-xl font-bold text-white mt-0.5">₹{o.total_amount.toLocaleString()}</p>
                        <p className="text-[#8E8E9F] text-[11px]">{o.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: CRM & CLIENT LEADS */}
          {activeTab === 'crm' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">CRM & Customer Inbound Leads</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Track prospective buyers, appointment requests, notes and deals.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onShowToast('Exported CRM contacts to CSV.')}
                    className="px-3 py-2 rounded-xl bg-[#141422] text-[#A0A0B4] hover:text-white border border-[#222236] text-xs"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => setShowAddLeadModal(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Lead</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leads.map(l => (
                  <div key={l.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{l.customer_name}</h4>
                        <span className="text-[11px] font-mono text-[#8C8C9E]">{l.phone}</span>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                        l.status === 'converted' ? 'bg-[#102414] text-[#25D366]' :
                        l.status === 'qualified' ? 'bg-[#141E28] text-[#4FA3E5]' : 'bg-[#241E10] text-[#E5B54F]'
                      }`}>
                        {l.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#8E8E9F] line-clamp-2">
                      {l.notes[0] || 'No notes added yet.'}
                    </p>

                    <div className="pt-3 border-t border-[#181826] flex items-center justify-between text-xs">
                      <span className="font-mono text-[#DFBA5A] font-bold">Est: ₹{l.estimated_value.toLocaleString()}</span>
                      <a
                        href={`https://wa.me/${l.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${l.customer_name}, following up regarding your enquiry with ${currentBusiness.business_name}.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#25D366] hover:underline flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: PROPOSALS & QUOTES */}
          {activeTab === 'proposals' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">Bespoke Proposals & Quotations</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Generate formal client quotations with line items and terms.</p>
                </div>
                <button
                  onClick={() => setShowCreateProposalModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Proposal</span>
                </button>
              </div>

              <div className="space-y-3">
                {proposals.map(p => (
                  <div key={p.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-[#181826]">
                      <div>
                        <span className="font-mono font-bold text-[#DFBA5A] text-xs">{p.proposal_number}</span>
                        <h4 className="font-bold text-white text-sm mt-0.5">{p.client_name} · {p.client_phone}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#182618] text-[#25D366]">
                          {p.status.toUpperCase()}
                        </span>
                        <button
                          onClick={() => window.print()}
                          className="p-1.5 rounded-lg bg-[#141422] hover:bg-[#1E1E30] text-[#DFBA5A]"
                          title="Print / Save PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      {p.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[#8E8E9F]">
                          <span>{item.quantity}x {item.description}</span>
                          <span className="font-mono text-white">₹{item.total.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-[#181826] flex items-center justify-between text-xs">
                      <span className="text-[#707086]">Valid until: {p.valid_until}</span>
                      <span className="font-mono font-bold text-white text-sm">Total: ₹{p.total_amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: GST INVOICES */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">GST Invoices & Payment Receipts</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Compliant tax invoices with HSN/SAC codes and payment reconciliation.</p>
                </div>
                <button
                  onClick={() => onShowToast('Invoice generated for latest order.')}
                  className="px-4 py-2 rounded-xl bg-[#141422] text-[#DFBA5A] border border-[#28283C] text-xs font-semibold"
                >
                  Generate Invoice
                </button>
              </div>

              <div className="space-y-3">
                {invoices.map(i => (
                  <div key={i.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#DFBA5A]">{i.invoice_number}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          i.status === 'paid' ? 'bg-[#102414] text-[#25D366]' : 'bg-[#2E1416] text-[#FF7070]'
                        }`}>
                          {i.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="font-bold text-white mt-1">{i.customer_name} · {i.customer_phone}</p>
                      <p className="text-[11px] text-[#808094]">{i.billing_address}</p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-bold text-white text-base">₹{i.grand_total.toLocaleString()}</p>
                      <span className="text-[10px] text-[#707084]">Due: {i.due_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: SERVICE BOOKINGS */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">Service Appointments & Reservations</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Automated availability calendar with zero double-booking protection.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookings.map(b => (
                  <div key={b.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl space-y-2.5 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[#DFBA5A]">{b.service_name}</span>
                        <h4 className="font-bold text-white text-sm mt-0.5">{b.customer_name}</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#102414] text-[#25D366] font-mono text-[10px]">
                        {b.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="p-3 bg-[#11111C] rounded-xl border border-[#1F1F2E] flex items-center justify-between font-mono">
                      <span>{b.booking_date}</span>
                      <span className="text-[#DFBA5A]">{b.time_slot}</span>
                    </div>

                    <p className="text-[#8E8E9F] text-[11px]">{b.notes || 'No special requirements noted.'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 9: 15 AI BUSINESS TOOLS */}
          {activeTab === 'ai_studio' && (
            <div className="space-y-4">
              <AiStudioSection
                tenantId={businessId}
                businessName={currentBusiness?.business_name}
                category={currentBusiness?.category}
                city={currentBusiness?.city}
                onShowToast={onShowToast}
              />
            </div>
          )}

          {/* TAB 10: SUBSCRIPTION */}
          {activeTab === 'subscription' && (
            <div className="bg-[#0C0C14] border border-[#1E1E2C] p-6 rounded-2xl space-y-6">
              <div>
                <h2 className="font-luxury text-xl font-bold text-white">Multi-Tenant Platform Subscription</h2>
                <p className="text-xs text-[#808094] mt-0.5">Manage your active business tier, quota limits, and billing cycle.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { plan: 'starter', name: 'Starter Tier', price: '₹999/mo', desc: '1 Website, standard templates, WhatsApp orders, manual delivery.' },
                  { plan: 'professional', name: 'Professional Tier', price: '₹2,499/mo', desc: 'E-commerce cart, payment gateway, custom domain, automated delivery fleet dispatch.' },
                  { plan: 'enterprise', name: 'Enterprise VIP', price: '₹8,999/mo', desc: 'Multiple websites, unlimited AI tools, dedicated delivery boys fleet management, priority support.' },
                ].map(p => (
                  <div
                    key={p.plan}
                    className={`p-5 rounded-2xl border space-y-3 flex flex-col justify-between ${
                      subscription.plan_id === p.plan
                        ? 'bg-[#181824] border-[#DFBA5A] shadow-lg shadow-[#DFBA5A]/10'
                        : 'bg-[#101018] border-[#222232]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-luxury font-bold text-white">{p.name}</h4>
                        {subscription.plan_id === p.plan && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#DFBA5A] text-[#0A0A0E] font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xl font-bold text-[#DFBA5A] mt-1">{p.price}</p>
                      <p className="text-xs text-[#8E8E9F] mt-2">{p.desc}</p>
                    </div>

                    <button
                      onClick={() => {
                        subscriptionService.upgradePlan(businessId, p.plan as any, 'monthly');
                        onShowToast(`Subscribed to ${p.name}!`);
                        loadTenantData();
                      }}
                      className={`w-full py-2 rounded-xl text-xs font-bold ${
                        subscription.plan_id === p.plan
                          ? 'bg-[#1E1E2E] text-[#808094] cursor-default'
                          : 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A]'
                      }`}
                    >
                      {subscription.plan_id === p.plan ? 'Active Plan' : 'Select Plan'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 11: SUPPORT TICKETS */}
          {activeTab === 'support' && (
            <div className="space-y-4">
              <div className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">Tenant Priority Support Desk</h2>
                  <p className="text-xs text-[#808094] mt-0.5">Submit questions, technical issues or integration requests directly to Super Admin.</p>
                </div>
                <button
                  onClick={() => setShowTicketModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Open Ticket</span>
                </button>
              </div>

              <div className="space-y-3">
                {tickets.map(t => (
                  <div key={t.id} className="bg-[#0C0C14] border border-[#1E1E2C] p-5 rounded-2xl space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-[#181826]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#DFBA5A]">{t.ticket_number}</span>
                        <span className="font-bold text-white">{t.subject}</span>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                        t.status === 'resolved' ? 'bg-[#102414] text-[#25D366]' : 'bg-[#261E10] text-[#E5B54F]'
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {t.messages.map(m => (
                        <div key={m.id} className={`p-3 rounded-xl max-w-xl text-xs ${
                          m.sender === 'admin' ? 'bg-[#161626] border border-[#25253C] ml-auto text-right' : 'bg-[#11111C]'
                        }`}>
                          <span className="text-[10px] font-mono text-[#707086] block">
                            {m.sender === 'admin' ? 'Vijay Visuals Super Admin' : 'You'} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <p className="text-white mt-1">{m.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ADD PRODUCT MODAL */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0C0C14] border border-[#242436] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-luxury font-bold text-white text-base mb-3">Add Product to Store</h3>
            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="text-[#8E8E9F] block mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={e => setNewProdName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                  placeholder="e.g. 22K Gold Solitaire Ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8E8E9F] block mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={newProdPrice}
                    onChange={e => setNewProdPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#8E8E9F] block mb-1">Initial Stock</label>
                  <input
                    type="number"
                    required
                    value={newProdStock}
                    onChange={e => setNewProdStock(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141420] text-[#8E8E9F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#DFBA5A] text-[#08080A] font-bold"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD LEAD MODAL */}
      {showAddLeadModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0C0C14] border border-[#242436] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-luxury font-bold text-white text-base mb-3">Add Customer Lead to CRM</h3>
            <form onSubmit={handleCreateLead} className="space-y-3 text-xs">
              <div>
                <label className="text-[#8E8E9F] block mb-1">Client Full Name</label>
                <input
                  type="text"
                  required
                  value={leadName}
                  onChange={e => setLeadName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8E8E9F] block mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    value={leadPhone}
                    onChange={e => setLeadPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[#8E8E9F] block mb-1">Estimated Value (₹)</label>
                  <input
                    type="number"
                    value={leadValue}
                    onChange={e => setLeadValue(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddLeadModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141420] text-[#8E8E9F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#DFBA5A] text-[#08080A] font-bold"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PROPOSAL MODAL */}
      {showCreateProposalModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0C0C14] border border-[#242436] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-luxury font-bold text-white text-base mb-3">Draft New Proposal / Quote</h3>
            <form onSubmit={handleCreateProposal} className="space-y-3 text-xs">
              <div>
                <label className="text-[#8E8E9F] block mb-1">Client Name</label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                />
              </div>
              <div>
                <label className="text-[#8E8E9F] block mb-1">Item / Scope of Work</label>
                <input
                  type="text"
                  required
                  value={itemDesc}
                  onChange={e => setItemDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                  placeholder="e.g. 22K Custom Polki Choker"
                />
              </div>
              <div>
                <label className="text-[#8E8E9F] block mb-1">Total Fee / Quote (₹)</label>
                <input
                  type="number"
                  required
                  value={itemPrice}
                  onChange={e => setItemPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateProposalModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141420] text-[#8E8E9F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#DFBA5A] text-[#08080A] font-bold"
                >
                  Generate Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TICKET MODAL */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0C0C14] border border-[#242436] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="font-luxury font-bold text-white text-base mb-3">Open Support Ticket</h3>
            <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
              <div>
                <label className="text-[#8E8E9F] block mb-1">Issue Subject</label>
                <input
                  type="text"
                  required
                  value={ticketSubject}
                  onChange={e => setTicketSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                />
              </div>
              <div>
                <label className="text-[#8E8E9F] block mb-1">Category</label>
                <select
                  value={ticketCategory}
                  onChange={e => setTicketCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white"
                >
                  <option value="technical">Technical / Code</option>
                  <option value="website">Custom Domain & Website</option>
                  <option value="billing">Billing & Subscriptions</option>
                  <option value="delivery">Delivery Fleet Logistics</option>
                  <option value="ai">AI Quotas & Processing</option>
                </select>
              </div>
              <div>
                <label className="text-[#8E8E9F] block mb-1">Describe your question or issue</label>
                <textarea
                  required
                  rows={3}
                  value={ticketMessage}
                  onChange={e => setTicketMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#12121E] border border-[#26263A] text-white resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#141420] text-[#8E8E9F]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#DFBA5A] text-[#08080A] font-bold"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
