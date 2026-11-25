import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { initiateCashfreePlatformCheckout } from '../lib/cashfreeClient';
import { readAndOptimizeImageFile } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import {
  AppointmentRecord,
  AuditLogRecord,
  CouponRecord,
  DeliveryPartnerRecord,
  GalleryItem,
  OrderRecord,
  PlatformPlanRecord,
  ProductRecord,
  StaffMemberRecord,
  SupportTicketRecord,
  TenantModules,
  TenantRecord,
  UserProfile,
} from '../types/platform';
import { OwnerCategoryModal } from './OwnerCategoryModal';
import { OwnerOrderDetailModal } from './OwnerOrderDetailModal';
import { OwnerCustomerProfileModal } from './OwnerCustomerProfileModal';
import { OperationsTab, OwnerOperationsSuite } from './OwnerOperationsSuite';
import { GrowthTab, GrowthWorkspace } from './GrowthWorkspace';
import { AdminEcosystemPanel } from './AdminEcosystemPanel';
import { BusinessCommandCenter } from './BusinessCommandCenter';
import { InventoryAndHrOps } from './InventoryAndHrOps';
import { HelpAndSuccessCenter } from './HelpAndSuccessCenter';
import { CustomerSupportCenter } from './CustomerSupportCenter';
import { CustomerLogoCustomizer } from './CustomerLogoCustomizer';
import { CustomerWebsiteEditor } from './CustomerWebsiteEditor';
import { BusinessLocationsManager } from './BusinessLocationsManager';
import { DeliveryGpsSharer } from './DeliveryGpsSharer';
import { DomainManagementCenter } from './DomainManagementCenter';
import { AdminDomainManagement } from './AdminDomainManagement';
import { OwnerReviewsManager } from './OwnerReviewsManager';
import { AdminReviewsModeration } from './AdminReviewsModeration';
import { AdminDeliveriesPanel } from './AdminDeliveriesPanel';
import { Lang } from '../data/content';
import { VijayVisualsLogo } from './VijayVisualsLogo';

interface DashboardsHubProps {
  allTenants: TenantRecord[];
  wishlistIds: number[];
  lang?: Lang;
  onToggleWishlist: (productId: number) => void;
  onRefreshTenants: () => void;
  onOpenStorefront: (slug: string) => void;
  onOpenInvoice: (order: OrderRecord, tenantName: string) => void;
  onGoBuilder: (tenantId?: number) => void;
  onGoAiCenter: () => void;
  onNotify: (msg: string) => void;
}

type RoleTab = 'owner' | 'delivery' | 'customer' | 'super_admin';

interface CustomerPackageStatus {
  packageStatus: string;
  planCode: string;
  planName: string;
  paymentStatus: string | null;
  canPublish: boolean;
  currentPeriodEnd: string | null;
  isFreeStart: boolean;
  amountInr: number | null;
  websiteId: string | null;
}

const getPackageStatusClass = (status: string): string => {
  if (status === 'active' || status === 'free_start') {
    return 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30';
  }
  if (status === 'pending') {
    return 'bg-sky-950/60 text-sky-400 border-sky-500/30';
  }
  if (status === 'failed' || status === 'refunded' || status === 'expired') {
    return 'bg-rose-950/60 text-rose-400 border-rose-500/30';
  }
  return 'bg-[#171722] text-[#9E9EB2] border-[#2A2A38]';
};

const getReceiptNumber = (p: any): string =>
  p?.receipt || p?.receiptNumber || (p?.id ? `RCPT-${p.id}` : 'RCPT-UNAVAILABLE');

const getPlanName = (p: any): string =>
  p?.plan_name || p?.planName || p?.plan_code || p?.planCode || 'Business Website Package';

const getBaseAmount = (p: any): number | null => {
  if (typeof p?.base_amount_inr === 'number' && p.base_amount_inr > 0) return p.base_amount_inr;
  if (typeof p?.baseAmountInr === 'number' && p.baseAmountInr > 0) return p.baseAmountInr;
  if (typeof p?.amountInr === 'number' && p.amountInr > 0 && typeof p?.grandTotalInr === 'number' && p.grandTotalInr > p.amountInr) return p.amountInr;
  return null;
};

const getGstAmount = (p: any): number | null => {
  if (typeof p?.gst_amount_inr === 'number' && p.gst_amount_inr >= 0) return p.gst_amount_inr;
  if (typeof p?.gstAmountInr === 'number' && p.gstAmountInr >= 0) return p.gstAmountInr;
  return null;
};

const getGrandTotal = (p: any): number | null => {
  if (typeof p?.amount_inr === 'number' && p.amount_inr > 0) return p.amount_inr;
  if (typeof p?.grandTotalInr === 'number' && p.grandTotalInr > 0) return p.grandTotalInr;
  if (typeof p?.amountInr === 'number' && p.amountInr > 0) return p.amountInr;
  return null;
};

const getPaymentDate = (p: any): string | null =>
  p?.paid_at || p?.paidAt || p?.created_at || p?.createdAt || null;

const getPaymentId = (p: any): string | null =>
  p?.cf_payment_id || p?.cfPaymentId || p?.razorpay_payment_id || p?.razorpayPaymentId || null;

export const DashboardsHub: React.FC<DashboardsHubProps> = ({
  allTenants,
  wishlistIds,
  lang = 'en',
  onToggleWishlist,
  onRefreshTenants,
  onOpenStorefront,
  onOpenInvoice,
  onGoBuilder,
  onGoAiCenter,
  onNotify,
}) => {
  const { profile, ownedTenants, openAuthModal, refreshProfile } = useAuth();
  const [roleTab, setRoleTab] = useState<RoleTab>('owner');

  // --- BUSINESS OWNER STATE ---
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [ownerSection, setOwnerSection] = useState<
    | 'command_center'
    | 'website_editor'
    | 'onboarding'
    | 'overview'
    | 'products'
    | 'gallery'
    | 'customers'
    | 'reviews'
    | 'store_settings'
    | 'owner_profile'
    | 'inventory_po'
    | 'orders'
    | 'team'
    | 'hr_tasks'
    | 'locations'
    | 'marketing'
    | 'help_center'
    | 'support_center'
    | 'logo_branding'
    | OperationsTab
    | GrowthTab
  >('command_center');
  const [ownerData, setOwnerData] = useState<{
    tenant: TenantRecord;
    stats: {
      totalRevenue: number;
      todayRevenue?: number;
      weeklyRevenue?: number;
      monthlyRevenue?: number;
      orderCount: number;
      totalOrders?: number;
      pendingOrders?: number;
      completedOrders?: number;
      cancelledOrders?: number;
      totalCustomers?: number;
      productCount: number;
      activeProductsCount?: number;
      inactiveProductsCount?: number;
      lowStockCount: number;
      activeDeliveries: number;
      salesTrend?: Array<{ date: string; revenue: number; orders: number }>;
      recentActivities?: Array<{ id: string; action: string; description: string; timestamp: string }>;
    };
    products: ProductRecord[];
    orders: OrderRecord[];
    coupons: CouponRecord[];
    deliveryPartners: DeliveryPartnerRecord[];
    staff: StaffMemberRecord[];
  } | null>(null);

  // Add / Edit Product form
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<number | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCat, setProdCat] = useState('Featured');
  const [prodSubcat, setProdSubcat] = useState('General');
  const [prodSku, setProdSku] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodPrice, setProdPrice] = useState(1499);
  const [prodCompareAt, setProdCompareAt] = useState(0);
  const [prodWholesale, setProdWholesale] = useState(0);
  const [prodStock, setProdStock] = useState(25);
  const [prodVariants, setProdVariants] = useState('Standard, Large');
  const [prodSpecs, setProdSpecs] = useState('');
  const [prodVideoUrl, setProdVideoUrl] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImages, setProdImages] = useState<string[]>([]);
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodBestseller, setProdBestseller] = useState(false);
  const [uploadingProdImg, setUploadingProdImg] = useState(false);
  const [aiWritingDesc, setAiWritingDesc] = useState(false);

  // Product Search, Filters & Category Modal
  const [prodSearchQuery, setProdSearchQuery] = useState('');
  const [prodCategoryFilter, setProdCategoryFilter] = useState('all');
  const [prodStockFilter, setProdStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive'>('all');
  const [prodSortBy, setProdSortBy] = useState<'name_asc' | 'price_asc' | 'price_desc' | 'stock_asc'>('name_asc');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Order Search, Filter & Detail Modal
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<OrderRecord | null>(null);

  // Customer Search & Profile Modal
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<{
    name: string;
    phone: string;
    email: string;
    ordersCount: number;
    totalSpent: number;
    lastOrderAt: string;
  } | null>(null);

  // Owner Gallery & Quick Store Settings drafts
  const [ownerGalleryDraft, setOwnerGalleryDraft] = useState<GalleryItem[]>([]);
  const [savingGallery, setSavingGallery] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<{
    codEnabled: boolean;
    upiId: string;
    deliveryFee: number;
    businessHours: string;
    deliveryInfo: string;
    returnPolicy: string;
    enabledModules: TenantModules;
  } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Add Coupon / Staff / Delivery Partner forms
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percent' | 'flat'>('percent');
  const [couponVal, setCouponVal] = useState(10);
  const [couponMinOrder, setCouponMinOrder] = useState(500);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'store_manager' | 'inventory_clerk' | 'support_agent'>('store_manager');
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderVehicle, setRiderVehicle] = useState('Two-Wheeler');

  // --- DELIVERY PORTAL STATE ---
  const [deliveryData, setDeliveryData] = useState<{
    partners: DeliveryPartnerRecord[];
    assignedOrders: OrderRecord[];
  }>({ partners: [], assignedOrders: [] });
  const [joinTenantId, setJoinTenantId] = useState<number>(allTenants[0]?.id || 1);
  const [joinPhone, setJoinPhone] = useState('');
  const [joinVehicle, setJoinVehicle] = useState('Two-Wheeler Express');

  // --- CUSTOMER DASHBOARD STATE ---
  const [customerOrders, setCustomerOrders] = useState<OrderRecord[]>([]);
  const [customerTickets, setCustomerTickets] = useState<SupportTicketRecord[]>([]);
  const [customerAppointments, setCustomerAppointments] = useState<AppointmentRecord[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [ownerEditName, setOwnerEditName] = useState('');
  const [ownerEditPhone, setOwnerEditPhone] = useState('');
  const [ownerEditEmail, setOwnerEditEmail] = useState('');
  const [savingOwnerProfile, setSavingOwnerProfile] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'order_issue' | 'refund' | 'platform_support'>('order_issue');
  const [ticketMsg, setTicketMsg] = useState('');

  // Customer Platform Purchases & Entitlements
  const [platformPayments, setPlatformPayments] = useState<any[]>([]);
  const [packageStatus, setPackageStatus] = useState<CustomerPackageStatus | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [buyingPackage, setBuyingPackage] = useState(false);

  // --- SUPER ADMIN STATE ---
  const [adminData, setAdminData] = useState<{
    stats: {
      tenantCount: number;
      publishedTenantsCount?: number;
      draftTenantsCount?: number;
      userCount: number;
      orderCount: number;
      gmv: number;
      pwaEnabledCount: number;
      totalAiUsed: number;
      proposalsCount?: number;
      acceptedProposalsCount?: number;
      domainsCount?: number;
      verifiedDomainsCount?: number;
      newsletterCount?: number;
    };
    tenants: TenantRecord[];
    users: UserProfile[];
    orders: OrderRecord[];
    tickets: SupportTicketRecord[];
    plans: PlatformPlanRecord[];
    audits: AuditLogRecord[];
    proposals?: Array<{
      id: number;
      proposalNumber: string;
      customerName: string;
      customerEmail: string;
      businessName: string;
      oneTimeSubtotalInr: number;
      recurringSubtotalInr: number;
      gstInr: number;
      grandTotalInr: number;
      status: string;
      createdAt: string;
    }>;
    domains?: Array<{
      id: number;
      tenantId: number;
      domainName: string;
      dnsStatus: string;
      sslStatus: string;
      expiryDate: string;
    }>;
  } | null>(null);
  const [adminSubTab, setAdminSubTab] = useState<'tenants' | 'deliveries' | 'domains' | 'ecosystem' | 'proposals' | 'plans' | 'users' | 'tickets' | 'audits' | 'reviews_mod'>('tenants');
  const [retryingCustDeliveryId, setRetryingCustDeliveryId] = useState<number | null>(null);
  const [customerDomainTenantId, setCustomerDomainTenantId] = useState<number | null>(null);
  const [planPriceDrafts, setPlanPriceDrafts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (allTenants.length > 0 && !joinTenantId) {
      setJoinTenantId(allTenants[0].id);
    }
  }, [allTenants, joinTenantId]);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name);
      setProfilePhone(profile.phone || '+91 9381362201');
      setProfileEmail(profile.email || 'vk66278@gmail.com');
      setOwnerEditName(profile.name || 'VIJAY VISUALS');
      setOwnerEditPhone(profile.phone || '+91 9381362201');
      setOwnerEditEmail(profile.email || 'vk66278@gmail.com');
      setJoinPhone((prev) => prev || profile.phone || '+91 9381362201');
      try {
        const arr = JSON.parse(profile.savedAddressesJson || '[]');
        setSavedAddresses(Array.isArray(arr) ? arr : []);
      } catch {
        setSavedAddresses([]);
      }
      if (profile.role === 'customer' && ownedTenants.length === 0) {
        setRoleTab((prev) => (prev === 'owner' ? 'customer' : prev));
      } else if (profile.role === 'delivery_partner') {
        setRoleTab((prev) => (prev === 'owner' ? 'delivery' : prev));
      } else if (profile.role === 'super_admin' && !selectedTenantId && ownedTenants[0]) {
        setSelectedTenantId(ownedTenants[0].id);
      } else if (ownedTenants[0] && !selectedTenantId) {
        setSelectedTenantId(ownedTenants[0].id);
      }
    }
  }, [profile, ownedTenants, selectedTenantId]);

  const loadOwnerOverview = useCallback(async (tenantId: number) => {
    try {
      const data = await apiFetch<typeof ownerData>(`/api/owner/tenants/${tenantId}/overview`);
      setOwnerData(data);
      if (data?.tenant) {
        setOwnerGalleryDraft(
          data.tenant.galleryItems && data.tenant.galleryItems.length > 0
            ? data.tenant.galleryItems
            : (data.tenant.galleryImages || []).map((url, idx) => ({
                id: `gal_${idx + 1}`,
                url,
                title: '',
                description: '',
                category: 'Showcase',
                order: idx,
              }))
        );
        setSettingsDraft({
          codEnabled: data.tenant.codEnabled !== false,
          upiId: data.tenant.upiId || '',
          deliveryFee: Number(data.tenant.deliveryFee || 0),
          businessHours: data.tenant.businessHours || '',
          deliveryInfo: data.tenant.deliveryInfo || '',
          returnPolicy: data.tenant.returnPolicy || '',
          enabledModules: data.tenant.enabledModules || {
            ecommerce: true,
            cartCheckout: true,
            gallery: true,
            bookings: false,
            whatsappOrder: true,
            reviews: true,
            wishlist: true,
            coupons: true,
            wholesale: false,
          },
        });
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load owner dashboard.');
    }
  }, [onNotify]);

  const ownerCustomers = useMemo(() => {
    const map = new Map<
      string,
      { name: string; phone: string; email: string; ordersCount: number; totalSpent: number; lastOrderAt: string }
    >();
    for (const o of ownerData?.orders || []) {
      const key = (o.customerPhone || o.customerEmail || o.customerName || String(o.id)).toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.ordersCount += 1;
        existing.totalSpent += Number(o.total || 0);
        if (o.createdAt > existing.lastOrderAt) existing.lastOrderAt = o.createdAt;
      } else {
        map.set(key, {
          name: o.customerName || 'Customer',
          phone: o.customerPhone || '—',
          email: o.customerEmail || '—',
          ordersCount: 1,
          totalSpent: Number(o.total || 0),
          lastOrderAt: o.createdAt || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [ownerData?.orders]);

  const displayedProducts = useMemo(() => {
    if (!ownerData?.products) return [];
    let list = [...ownerData.products];
    if (prodSearchQuery.trim()) {
      const q = prodSearchQuery.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (prodCategoryFilter !== 'all') {
      list = list.filter((p) => p.category.toLowerCase() === prodCategoryFilter.toLowerCase());
    }
    if (prodStockFilter === 'in_stock') {
      list = list.filter((p) => p.stock > (p.lowStockThreshold || 5) && p.active !== false);
    } else if (prodStockFilter === 'low_stock') {
      list = list.filter((p) => p.stock > 0 && p.stock <= (p.lowStockThreshold || 5) && p.active !== false);
    } else if (prodStockFilter === 'out_of_stock') {
      list = list.filter((p) => p.stock <= 0 && p.active !== false);
    } else if (prodStockFilter === 'inactive') {
      list = list.filter((p) => p.active === false);
    }

    list.sort((a, b) => {
      if (prodSortBy === 'price_asc') return a.price - b.price;
      if (prodSortBy === 'price_desc') return b.price - a.price;
      if (prodSortBy === 'stock_asc') return a.stock - b.stock;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [ownerData?.products, prodSearchQuery, prodCategoryFilter, prodStockFilter, prodSortBy]);

  const displayedOrders = useMemo(() => {
    if (!ownerData?.orders) return [];
    let list = [...ownerData.orders];
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.trim().toLowerCase();
      list = list.filter((o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(q))
      );
    }
    if (orderStatusFilter !== 'all') {
      list = list.filter((o) => o.status === orderStatusFilter);
    }
    return list;
  }, [ownerData?.orders, orderSearchQuery, orderStatusFilter]);

  const displayedCustomers = useMemo(() => {
    if (!ownerCustomers) return [];
    if (!customerSearchQuery.trim()) return ownerCustomers;
    const q = customerSearchQuery.trim().toLowerCase();
    return ownerCustomers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [ownerCustomers, customerSearchQuery]);

  const loadDeliveryPortal = useCallback(async () => {
    try {
      const data = await apiFetch<{ partners: DeliveryPartnerRecord[]; assignedOrders: OrderRecord[] }>('/api/delivery/portal');
      setDeliveryData(data);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load delivery portal.');
    }
  }, [onNotify]);

  const loadCustomerDashboard = useCallback(async () => {
    try {
      const [ordRes, tktRes, apptRes] = await Promise.all([
        apiFetch<{ orders: OrderRecord[] }>('/api/customer/orders').catch(() => ({ orders: [] })),
        apiFetch<{ tickets: SupportTicketRecord[] }>('/api/customer/tickets').catch(() => ({ tickets: [] })),
        apiFetch<{ appointments: AppointmentRecord[] }>('/api/customer/appointments').catch(() => ({ appointments: [] })),
      ]);
      setCustomerOrders(ordRes.orders);
      setCustomerTickets(tktRes.tickets);
      setCustomerAppointments(apptRes.appointments || []);

      try {
        const histRes = await apiFetch<{ payments: any[] }>('/api/payments/platform/history');
        setPlatformPayments(histRes.payments || []);
      } catch {
        // Platform payments unconfigured or empty
      }

      try {
        const statusRes = await apiFetch<CustomerPackageStatus>('/api/customer/package-status');
        setPackageStatus(statusRes);
      } catch {
        setPackageStatus(null);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load customer data.');
    }
  }, [onNotify]);

  const handleCustomerRetryDelivery = async (paymentId: number) => {
    setRetryingCustDeliveryId(paymentId);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; websiteUrl?: string }>(
        `/api/payments/platform/${paymentId}/retry-delivery`,
        { method: 'POST' }
      );
      onNotify(res.message || 'Website delivery completed!');
      await loadCustomerDashboard();
      await refreshProfile();
      if (res.websiteUrl) {
        window.open(res.websiteUrl, '_blank');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delivery retry failed.');
    } finally {
      setRetryingCustDeliveryId(null);
    }
  };

  const loadSuperAdmin = useCallback(async () => {
    try {
      const data = await apiFetch<typeof adminData>('/api/admin/overview');
      setAdminData(data);
      if (data) {
        const drafts: Record<number, number> = {};
        data.plans.forEach((p) => {
          drafts[p.id] = p.priceInr;
        });
        setPlanPriceDrafts(drafts);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Super Admin access required.');
    }
  }, [onNotify]);

  useEffect(() => {
    if (!profile) return;
    if (roleTab === 'owner' && selectedTenantId) loadOwnerOverview(selectedTenantId);
    if (roleTab === 'delivery') loadDeliveryPortal();
    if (roleTab === 'customer') loadCustomerDashboard();
    if (roleTab === 'super_admin' && profile.role === 'super_admin') loadSuperAdmin();
  }, [profile, roleTab, selectedTenantId, loadOwnerOverview, loadDeliveryPortal, loadCustomerDashboard, loadSuperAdmin]);

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="rounded-xl border border-[#242434] bg-[#0E0E15] p-8 space-y-5 flex flex-col items-center">
          <VijayVisualsLogo variant="stacked" size="lg" mode="dark" showTagline />
          <h1 className="font-luxury text-2xl font-bold text-white mt-2">Sign In to Access Role Workspaces</h1>
          <p className="text-sm text-[#9E9EB2] max-w-md">
            Manage your multi-tenant business website, products, gallery, orders, invoices, or Super Admin controls with your secure VIJAY VISUALS account.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="px-6 py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold hover:opacity-95 transition-opacity"
          >
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  // --- OWNER HANDLERS ---
  const handleAiProductDescription = async () => {
    if (!selectedTenantId || !prodName.trim()) {
      onNotify('Enter a product name first so Gemini AI can write the description.');
      return;
    }
    setAiWritingDesc(true);
    try {
      const res = await apiFetch<{ output: string }>('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: selectedTenantId,
          task: 'product_description',
          input: `${prodName} (${prodCat} / ${prodSubcat}) priced at ₹${prodPrice}`,
          language: 'en',
        }),
      });
      setProdDesc(res.output);
      onNotify('AI description generated via Gemini.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI generation failed.');
    } finally {
      setAiWritingDesc(false);
    }
  };

  const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escapeCell = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escapeCell).join(','),
      ...rows.map((row) => row.map(escapeCell).join(',')),
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdCat('Featured');
    setProdSubcat('General');
    setProdSku('');
    setProdBarcode('');
    setProdPrice(1499);
    setProdCompareAt(0);
    setProdWholesale(0);
    setProdStock(25);
    setProdVariants('Standard, Large');
    setProdSpecs('');
    setProdVideoUrl('');
    setProdDesc('');
    setProdImages([]);
    setProdFeatured(false);
    setProdBestseller(false);
  };

  const handleLoadProductForEdit = (p: ProductRecord) => {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdCat(p.category || 'General');
    setProdSubcat(p.subcategory || '');
    setProdSku(p.sku || '');
    setProdBarcode(p.barcode || '');
    setProdPrice(p.price);
    setProdCompareAt(p.compareAtPrice || 0);
    setProdWholesale(p.wholesalePrice || 0);
    setProdStock(p.stock);
    try {
      const parsedVars = JSON.parse(p.variantsJson || '[]');
      setProdVariants(Array.isArray(parsedVars) ? parsedVars.join(', ') : '');
    } catch {
      setProdVariants('');
    }
    setProdSpecs(p.specs || '');
    setProdVideoUrl(p.videoUrl || '');
    setProdDesc(p.description || '');
    setProdImages(
      p.images && p.images.length > 0 ? p.images : p.imageUrl ? [p.imageUrl] : []
    );
    setProdFeatured(Boolean(p.featured));
    setProdBestseller(Boolean(p.bestseller));
    onNotify(`Editing "${p.name}". Update details and click Update Product.`);
  };

  const handleDuplicateProduct = async (p: ProductRecord) => {
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'duplicate' }),
      });
      await loadOwnerOverview(selectedTenantId);
      onNotify(`Duplicated "${p.name}" as a copy.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to duplicate product.');
    }
  };

  const handleToggleProductActive = async (p: ProductRecord) => {
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: p.active === false ? true : false }),
      });
      await loadOwnerOverview(selectedTenantId);
      onNotify(`Product "${p.name}" status updated.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update product status.');
    }
  };

  const handleExportProductsCsv = () => {
    if (!ownerData?.products?.length) {
      onNotify('No products available to export.');
      return;
    }
    const headers = ['ID', 'SKU', 'Barcode', 'Name', 'Category', 'Subcategory', 'Price', 'CompareAtPrice', 'Stock', 'Status'];
    const rows = ownerData.products.map((p) => [
      p.id,
      p.sku || '',
      p.barcode || '',
      p.name,
      p.category,
      p.subcategory || '',
      p.price,
      p.compareAtPrice || 0,
      p.stock,
      p.active !== false ? 'Active' : 'Disabled',
    ]);
    downloadCsv(`products-${ownerData.tenant.slug || 'catalog'}.csv`, headers, rows);
    onNotify('Product catalog CSV exported.');
  };

  const handleExportOrdersCsv = () => {
    if (!ownerData?.orders?.length) {
      onNotify('No orders available to export.');
      return;
    }
    const headers = ['Order Number', 'Date', 'Customer Name', 'Phone', 'Email', 'Payment Method', 'Payment Status', 'Order Status', 'Total (INR)'];
    const rows = ownerData.orders.map((o) => [
      o.orderNumber,
      o.createdAt || '',
      o.customerName,
      o.customerPhone,
      o.customerEmail || '',
      o.paymentMethod,
      o.paymentStatus,
      o.status,
      o.total,
    ]);
    downloadCsv(`orders-${ownerData.tenant.slug || 'store'}.csv`, headers, rows);
    onNotify('Store orders CSV exported.');
  };

  const handleExportCustomersCsv = () => {
    if (!ownerCustomers.length) {
      onNotify('No customer records available to export.');
      return;
    }
    const headers = ['Customer Name', 'Phone', 'Email', 'Total Orders Placed', 'Total Spent (INR)', 'Last Order Date'];
    const rows = ownerCustomers.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.ordersCount,
      c.totalSpent,
      c.lastOrderAt || '',
    ]);
    downloadCsv(`customers-${ownerData?.tenant.slug || 'directory'}.csv`, headers, rows);
    onNotify('Customer directory CSV exported.');
  };

  const handleImportProductsCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedTenantId) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        onNotify('CSV file is empty or missing data rows.');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h.includes('name'));
      const priceIdx = headers.findIndex((h) => h.includes('price'));
      const catIdx = headers.findIndex((h) => h.includes('cat'));
      const stockIdx = headers.findIndex((h) => h.includes('stock'));
      const skuIdx = headers.findIndex((h) => h.includes('sku'));

      if (nameIdx === -1 || priceIdx === -1) {
        onNotify('CSV must contain at least "Name" and "Price" columns.');
        return;
      }

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.replace(/"/g, '').trim());
        const name = cols[nameIdx];
        const price = Number(cols[priceIdx]) || 0;
        if (!name || price < 0) continue;

        await apiFetch(`/api/tenants/${selectedTenantId}/products`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            price,
            category: catIdx !== -1 && cols[catIdx] ? cols[catIdx] : 'General',
            stock: stockIdx !== -1 ? Number(cols[stockIdx]) || 10 : 10,
            sku: skuIdx !== -1 ? cols[skuIdx] : '',
          }),
        });
        imported++;
      }
      await loadOwnerOverview(selectedTenantId);
      onNotify(`Successfully imported ${imported} product(s) from CSV.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to import CSV.');
    }
  };

  const handleUploadProductImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 6 - prodImages.length));
    e.target.value = '';
    if (files.length === 0) {
      onNotify('Maximum 6 images per product.');
      return;
    }
    setUploadingProdImg(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const url = await readAndOptimizeImageFile(file, 900);
        uploaded.push(url);
      }
      setProdImages((prev) => [...prev, ...uploaded].slice(0, 6));
      onNotify(`Added ${uploaded.length} product image${uploaded.length > 1 ? 's' : ''}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to upload product image.');
    } finally {
      setUploadingProdImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    const payload = {
      name: prodName.trim(),
      category: prodCat.trim() || 'General',
      subcategory: prodSubcat.trim(),
      sku: prodSku.trim(),
      barcode: prodBarcode.trim(),
      price: Number(prodPrice),
      compareAtPrice: Number(prodCompareAt) > 0 ? Number(prodCompareAt) : 0,
      wholesalePrice: Number(prodWholesale) || 0,
      stock: Number(prodStock),
      description: prodDesc.trim(),
      specs: prodSpecs.trim(),
      videoUrl: prodVideoUrl.trim(),
      featured: prodFeatured,
      bestseller: prodBestseller,
      variantsJson: JSON.stringify(
        prodVariants
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
      images: prodImages,
      imageUrl: prodImages[0] || ownerData?.tenant.bannerImage || '',
    };

    try {
      if (editingProductId) {
        await apiFetch(`/api/products/${editingProductId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onNotify(`Updated "${prodName.trim()}" successfully.`);
      } else {
        await apiFetch(`/api/tenants/${selectedTenantId}/products`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('Product added to storefront catalog.');
      }
      resetProductForm();
      await loadOwnerOverview(selectedTenantId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save product.');
    }
  };

  const handleSaveOwnerGallery = async () => {
    if (!selectedTenantId) return;
    setSavingGallery(true);
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          galleryItems: ownerGalleryDraft.map((g, i) => ({ ...g, order: i })),
          galleryImages: ownerGalleryDraft.map((g) => g.url),
        }),
      });
      await loadOwnerOverview(selectedTenantId);
      onRefreshTenants();
      onNotify('Business gallery saved & published to your storefront.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save gallery.');
    } finally {
      setSavingGallery(false);
    }
  };

  const handleSaveOwnerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !settingsDraft) return;
    setSavingSettings(true);
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}`, {
        method: 'PATCH',
        body: JSON.stringify(settingsDraft),
      });
      await loadOwnerOverview(selectedTenantId);
      onRefreshTenants();
      onNotify('Storefront settings, payment methods & modules updated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save store settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateOrder = async (orderId: number, patch: Record<string, unknown>) => {
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/owner/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadOwnerOverview(selectedTenantId);
      onNotify('Order updated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Order update failed.');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !couponCode.trim()) return;
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}/coupons`, {
        method: 'POST',
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          discountType: couponType,
          discountValue: Number(couponVal),
          minOrder: Math.max(0, Number(couponMinOrder) || 0),
        }),
      });
      setCouponCode('');
      await loadOwnerOverview(selectedTenantId);
      onNotify('Promotional coupon activated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to add coupon.');
    }
  };

  const handleDeleteCoupon = async (couponId: number) => {
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}/coupons?id=${couponId}`, {
        method: 'DELETE',
      });
      await loadOwnerOverview(selectedTenantId);
      onNotify('Coupon removed.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to delete coupon.');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ name: staffName.trim(), email: staffEmail.trim(), staffRole }),
      });
      setStaffName('');
      setStaffEmail('');
      await loadOwnerOverview(selectedTenantId);
      onNotify('Staff member added to business team.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to add staff.');
    }
  };

  const handleAddOwnerRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}/delivery-partners`, {
        method: 'POST',
        body: JSON.stringify({ name: riderName.trim(), phone: riderPhone.trim(), vehicleType: riderVehicle }),
      });
      setRiderName('');
      setRiderPhone('');
      await loadOwnerOverview(selectedTenantId);
      onNotify('Delivery partner added to fleet.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to add delivery partner.');
    }
  };

  // --- PLATFORM PACKAGE RENEWAL & CHECKOUT ---
  const handleRenewPackage = async (tenantId?: number) => {
    if (!profile) return;
    setBuyingPackage(true);
    try {
      const opts = {
        planCode: 'business-website',
        planName: 'Business Website Package (₹7,999)',
        websiteId: tenantId ? String(tenantId) : ownedTenants[0]?.id ? String(ownedTenants[0].id) : undefined,
        publishWebsite: true,
        prefill: {
          name: profile.name || '',
          email: profile.email || '',
          contact: profile.phone || '',
        },
        onSuccess: async () => {
          await loadCustomerDashboard();
          await refreshProfile();
          onNotify('Payment verified! Your website package subscription is active.');
        },
        onError: (err: Error) => {
          onNotify(err.message || 'Payment verification failed.');
        },
        onDismiss: () => {
          onNotify('Payment checkout was closed.');
        },
      };

      await initiateCashfreePlatformCheckout(opts);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to initialize payment checkout.');
    } finally {
      setBuyingPackage(false);
    }
  };

  // --- CUSTOMER PROFILE & TICKET HANDLERS ---
  const handleSaveProfile = async (addressesOverride?: string[]) => {
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          email: profileEmail.trim(),
          savedAddressesJson: JSON.stringify(addressesOverride ?? savedAddresses),
        }),
      });
      await refreshProfile();
      onNotify('Customer profile & addresses saved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleSaveOwnerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOwnerProfile(true);
    try {
      await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: ownerEditName.trim(),
          phone: ownerEditPhone.trim(),
          email: ownerEditEmail.trim(),
        }),
      });
      await refreshProfile();
      onNotify('Official Owner Profile & brand contact details updated successfully.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update owner profile.');
    } finally {
      setSavingOwnerProfile(false);
    }
  };

  const handleCustomerTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMsg.trim()) return;
    try {
      await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customerName: profile.name || profile.email,
          customerEmail: profile.email,
          customerPhone: profile.phone,
          subject: ticketSubject.trim(),
          message: ticketMsg.trim(),
          category: ticketCategory,
        }),
      });
      setTicketSubject('');
      setTicketMsg('');
      await loadCustomerDashboard();
      onNotify('Support ticket submitted.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Ticket submission failed.');
    }
  };

  // --- DELIVERY SELF-REGISTER ---
  const handleJoinDeliveryFleet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinTenantId || !joinPhone.trim()) return;
    try {
      await apiFetch(`/api/tenants/${joinTenantId}/delivery-partners`, {
        method: 'POST',
        body: JSON.stringify({
          name: profile.name || profile.email,
          phone: joinPhone.trim(),
          vehicleType: joinVehicle,
          linkCurrentUser: true,
        }),
      });
      await refreshProfile();
      await loadDeliveryPortal();
      onNotify('Registered as an active delivery partner.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Workspace Sidebar */}
        <aside className="lg:col-span-3 rounded-xl border border-[#21212F] bg-[#0D0D13] p-4 space-y-2">
          <div className="px-3 py-2 border-b border-[#1D1D28] mb-2">
            <p className="text-xs font-semibold text-white truncate">{profile.name || profile.email}</p>
            <p className="text-[11px] text-[#D4AF37] capitalize">{profile.role.replace('_', ' ')}</p>
          </div>

          <button
            type="button"
            onClick={() => setRoleTab('owner')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
              roleTab === 'owner' ? 'bg-[#1D1A10] text-[#ECC86A] border border-[#D4AF37]/40' : 'text-[#A5A5B8] hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Business Owner Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => setRoleTab('delivery')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
              roleTab === 'delivery' ? 'bg-[#1D1A10] text-[#ECC86A] border border-[#D4AF37]/40' : 'text-[#A5A5B8] hover:text-white'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Delivery Partner Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setRoleTab('customer')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
              roleTab === 'customer' ? 'bg-[#1D1A10] text-[#ECC86A] border border-[#D4AF37]/40' : 'text-[#A5A5B8] hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Customer Dashboard</span>
          </button>

          {profile.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => setRoleTab('super_admin')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors ${
                roleTab === 'super_admin' ? 'bg-[#1D1A10] text-[#ECC86A] border border-[#D4AF37]/40' : 'text-[#A5A5B8] hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Super Admin Console</span>
            </button>
          )}

          <div className="pt-3 border-t border-[#1D1D28] space-y-2">
            <button
              type="button"
              onClick={() => onGoBuilder()}
              className="w-full py-2 px-3 rounded-md border border-[#282838] text-xs text-[#D5D5E2] hover:border-[#D4AF37]"
            >
              + New Business Website
            </button>
            <button
              type="button"
              onClick={onGoAiCenter}
              className="w-full py-2 px-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              Open AI Automation Center
            </button>
          </div>
        </aside>

        {/* Main Workspace Panel */}
        <main className="lg:col-span-9 space-y-6">
          {/* ================= BUSINESS OWNER DASHBOARD (MODULE 5) ================= */}
          {roleTab === 'owner' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[#D4AF37]">Module 5 · Tenant-Isolated Business Operations</p>
                  <h1 className="font-luxury text-2xl font-bold text-white">Business Owner Dashboard</h1>
                </div>
                {ownedTenants.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTenantId ?? ''}
                      onChange={(e) => setSelectedTenantId(Number(e.target.value))}
                      className="rounded-md border border-[#2A2A3A] bg-[#0D0D13] px-3 py-2 text-xs text-white"
                    >
                      {ownedTenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (/site/{t.slug})
                        </option>
                      ))}
                    </select>
                    {ownerData && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOwnerSection('website_editor')}
                          className="px-3 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity flex items-center gap-1.5 shadow"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Website</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenStorefront(ownerData.tenant.slug)}
                          className="px-3 py-2 rounded-md border border-[#D4AF37]/40 text-xs text-[#ECC86A] hover:bg-[#16140D] transition-colors"
                        >
                          View Store
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {ownedTenants.length === 0 ? (
                <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-10 text-center space-y-4">
                  <p className="text-sm text-[#A5A5B8]">
                    You haven’t published a business website yet. Create one in the Website Builder to unlock inventory, orders, staff, delivery fleet, and AI automation.
                  </p>
                  <button
                    type="button"
                    onClick={() => onGoBuilder()}
                    className="px-5 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
                  >
                    Launch Website Builder
                  </button>
                </div>
              ) : ownerData ? (
                <>
                  {/* Business Overview KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Total Revenue</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#ECC86A] mt-1">
                        ₹{ownerData.stats.totalRevenue.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-[#7E7E92] mt-0.5">
                        Today: ₹{(ownerData.stats.todayRevenue || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Total Orders</p>
                      <p className="font-mono-tabular text-lg font-bold text-white mt-1">
                        {ownerData.stats.totalOrders || ownerData.stats.orderCount}
                      </p>
                      <p className="text-[10px] text-amber-400 mt-0.5">
                        {ownerData.stats.pendingOrders || 0} active / pending
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Completed Orders</p>
                      <p className="font-mono-tabular text-lg font-bold text-emerald-400 mt-1">
                        {ownerData.stats.completedOrders || 0}
                      </p>
                      <p className="text-[10px] text-rose-400 mt-0.5">
                        {ownerData.stats.cancelledOrders || 0} cancelled
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Customers</p>
                      <p className="font-mono-tabular text-lg font-bold text-white mt-1">
                        {ownerData.stats.totalCustomers || ownerCustomers.length}
                      </p>
                      <p className="text-[10px] text-[#7E7E92] mt-0.5">Verified buyers</p>
                    </div>
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Catalog Products</p>
                      <p className="font-mono-tabular text-lg font-bold text-white mt-1">
                        {ownerData.stats.productCount}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${ownerData.stats.lowStockCount > 0 ? 'text-amber-400 font-semibold' : 'text-[#7E7E92]'}`}>
                        {ownerData.stats.lowStockCount} low stock alerts
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#20202E] bg-[#0D0D13] p-3.5">
                      <p className="text-[10px] text-[#8E8EA2] uppercase font-semibold">Gemini AI Credits</p>
                      <p className="font-mono-tabular text-lg font-bold text-[#D4AF37] mt-1">
                        {ownerData.tenant.aiCreditsUsed}/{ownerData.tenant.aiCreditsLimit}
                      </p>
                      <p className="text-[10px] text-emerald-400 mt-0.5">Server Verified</p>
                    </div>
                  </div>

                  {/* Owner Sub-Tabs */}
                  <div className="flex flex-wrap gap-2 border-b border-[#1E1E2B] pb-3">
                    {[
                      { id: 'command_center', label: 'Daily Command Center' },
                      { id: 'website_editor', label: 'Edit Website & Content' },
                      { id: 'onboarding', label: '12-Step Setup' },
                      { id: 'overview', label: 'Orders & Dispatch' },
                      { id: 'products', label: 'Products & Catalog' },
                      { id: 'reviews', label: 'Reviews & Ratings' },
                      { id: 'gallery', label: 'Business Gallery' },
                      { id: 'customers', label: 'Customers' },
                      { id: 'store_settings', label: 'Store & Payment Settings' },
                      { id: 'owner_profile', label: 'Owner Profile & Contact' },
                      { id: 'inventory_po', label: 'Inventory & POs' },
                      { id: 'domains_dns', label: 'Domains & DNS' },
                      { id: 'locations', label: 'Branches & Maps' },
                      { id: 'seo_growth', label: 'Google SEO' },
                      { id: 'team', label: 'Delivery Fleet & Staff' },
                      { id: 'hr_tasks', label: 'Staff Tasks & Backup' },
                      { id: 'marketing', label: 'Coupons & License' },
                      { id: 'payments', label: 'Cashfree & Settlements' },
                      { id: 'crm_bookings', label: 'CRM & Bookings' },
                      { id: 'finance', label: 'Finance & GST' },
                      { id: 'proposals_quotes', label: 'Proposals & Subscribers' },
                      { id: 'supply_hr', label: 'Warehouses & HR' },
                      { id: 'plugins_dns', label: 'Plugins & Webhooks' },
                      { id: 'subscription_policy', label: 'Renewal & Export' },
                      { id: 'logo_branding', label: 'Logo & Branding' },
                      { id: 'support_center', label: 'Support & Changes' },
                      { id: 'help_center', label: 'Help & Status' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setOwnerSection(tab.id as typeof ownerSection)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                          ownerSection === tab.id
                            ? 'bg-[#D4AF37] text-[#08080A]'
                            : 'bg-[#12121A] text-[#A3A3B5] hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {(ownerSection === 'command_center' || ownerSection === 'onboarding') && (
                    <BusinessCommandCenter
                      tenant={ownerData.tenant}
                      mode={ownerSection}
                      onJumpTab={(tab) => setOwnerSection(tab as typeof ownerSection)}
                      onGoBuilder={onGoBuilder}
                      onOpenStorefront={onOpenStorefront}
                      onNotify={onNotify}
                    />
                  )}

                  {ownerSection === 'website_editor' && (
                    <CustomerWebsiteEditor
                      tenant={ownerData.tenant}
                      onRefreshTenant={() => {
                        if (selectedTenantId) loadOwnerOverview(selectedTenantId);
                        onRefreshTenants();
                      }}
                      onOpenStorefront={onOpenStorefront}
                      onGoBuilder={onGoBuilder}
                      onNotify={onNotify}
                    />
                  )}

                  {(ownerSection === 'inventory_po' || ownerSection === 'hr_tasks') && (
                    <InventoryAndHrOps
                      tenant={ownerData.tenant}
                      mode={ownerSection}
                      onRefreshTenant={() => {
                        if (selectedTenantId) loadOwnerOverview(selectedTenantId);
                        onRefreshTenants();
                      }}
                      onNotify={onNotify}
                    />
                  )}

                  {ownerSection === 'help_center' && (
                    <HelpAndSuccessCenter tenantId={ownerData.tenant.id} onNotify={onNotify} />
                  )}

                  {ownerSection === 'logo_branding' && (
                    <CustomerLogoCustomizer
                      tenantId={ownerData.tenant.id}
                      tenantName={ownerData.tenant.name}
                      currentLogo={{
                        initials: ownerData.tenant.logoText,
                        businessName: ownerData.tenant.name,
                      }}
                      onSaveLogo={async (cfg) => {
                        // Persist customized logo to tenant website settings
                        try {
                          await apiFetch(`/api/owner/tenants/${ownerData.tenant.id}/overview`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              logoText: cfg.initials || 'VV',
                              logoImage: cfg.type === 'image' ? cfg.imageUrl : null,
                            }),
                          });
                        } catch {
                          // Fallback local update
                        }
                        if (selectedTenantId) loadOwnerOverview(selectedTenantId);
                        onRefreshTenants();
                      }}
                      onNotify={onNotify}
                    />
                  )}

                  {ownerSection === 'support_center' && (
                    <CustomerSupportCenter
                      tenantId={ownerData.tenant.id}
                      websiteId={ownerData.tenant.slug}
                      userRole={profile?.role}
                      onNotify={onNotify}
                    />
                  )}

                  {ownerSection === 'locations' && (
                    <BusinessLocationsManager
                      tenant={ownerData.tenant}
                      onRefreshTenant={() => {
                        if (selectedTenantId) loadOwnerOverview(selectedTenantId);
                        onRefreshTenants();
                      }}
                      onNotify={onNotify}
                    />
                  )}

                  {/* ORDERS & DISPATCH */}
                  {ownerSection === 'overview' && (
                    <div className="space-y-4">
                      {/* Financial Trend & Performance Card */}
                      {ownerData.stats.salesTrend && ownerData.stats.salesTrend.length > 0 && (
                        <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E1E2B] pb-2.5">
                            <div>
                              <p className="text-xs font-semibold text-white">7-Day Store Revenue Velocity</p>
                              <p className="text-[10px] text-[#8E8EA2]">Daily sales and customer order volume breakdown</p>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-[#A5A5B8]">
                                Past 7 Days: <strong className="text-[#ECC86A] font-mono-tabular">₹{(ownerData.stats.weeklyRevenue || 0).toLocaleString('en-IN')}</strong>
                              </span>
                              <span className="text-[#A5A5B8]">
                                Past 30 Days: <strong className="text-white font-mono-tabular">₹{(ownerData.stats.monthlyRevenue || 0).toLocaleString('en-IN')}</strong>
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-7 gap-2 pt-1">
                            {ownerData.stats.salesTrend.map((t) => (
                              <div key={t.date} className="rounded-lg border border-[#1E1E2B] bg-[#09090E] p-2 text-center">
                                <p className="text-[10px] text-[#8E8EA2] font-mono-tabular">{t.date.slice(5)}</p>
                                <p className="font-mono-tabular text-xs font-bold text-white mt-1">₹{t.revenue.toLocaleString('en-IN')}</p>
                                <p className="text-[9px] text-[#D4AF37] mt-0.5">{t.orders} {t.orders === 1 ? 'order' : 'orders'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Orders Table with Search & Filters */}
                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-hidden">
                        <div className="p-4 border-b border-[#1E1E2A] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="w-3.5 h-3.5 text-[#8E8EA2] absolute left-3 top-2.5" />
                              <input
                                type="text"
                                value={orderSearchQuery}
                                onChange={(e) => setOrderSearchQuery(e.target.value)}
                                placeholder="Search by Order #, Customer Name, or Phone..."
                                className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
                              />
                            </div>
                            <select
                              value={orderStatusFilter}
                              onChange={(e) => setOrderStatusFilter(e.target.value)}
                              className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="all">All Statuses ({ownerData.orders.length})</option>
                              <option value="placed">Placed (New)</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="packed">Packed</option>
                              <option value="out_for_delivery">Out for Delivery</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled / Returned</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleExportOrdersCsv}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2A2A38] bg-[#08080C] text-xs text-white hover:border-[#D4AF37]"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Export Orders CSV</span>
                            </button>
                          </div>
                        </div>

                        {displayedOrders.length === 0 ? (
                          <p className="p-8 text-center text-xs text-[#8E8EA2]">
                            {ownerData.orders.length === 0
                              ? 'No orders placed yet. Open your live storefront to test a live checkout!'
                              : 'No orders match your search and filter criteria.'}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
                                <tr>
                                  <th className="py-2.5 px-4">Order</th>
                                  <th className="py-2.5 px-4">Customer</th>
                                  <th className="py-2.5 px-4 text-right">Total</th>
                                  <th className="py-2.5 px-4">Status</th>
                                  <th className="py-2.5 px-4">Delivery Partner</th>
                                  <th className="py-2.5 px-4 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1C1C28]">
                                {displayedOrders.map((ord) => (
                                  <tr key={ord.id} className="hover:bg-[#12121B] transition-colors">
                                    <td className="py-3 px-4 font-mono-tabular text-[#ECC86A]">
                                      <div
                                        onClick={() => setSelectedOrderDetail(ord)}
                                        className="cursor-pointer hover:underline font-semibold"
                                      >
                                        {ord.orderNumber}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-1">
                                        <span className="text-[10px] text-[#84849A] uppercase">{ord.paymentMethod}</span>
                                        <select
                                          value={ord.paymentStatus}
                                          onChange={(e) => handleUpdateOrder(ord.id, { paymentStatus: e.target.value })}
                                          className="rounded border border-[#262634] bg-[#09090D] px-1.5 py-0.5 text-[10px] text-[#D7D7E2]"
                                        >
                                          <option value="cod_due">COD Due</option>
                                          <option value="pending_verification">Verify UPI</option>
                                          <option value="paid">Paid</option>
                                          <option value="refunded">Refunded</option>
                                        </select>
                                      </div>
                                      {ord.paymentReference && (
                                        <div className="text-[10px] text-[#9A9AAE] mt-0.5">UTR: {ord.paymentReference}</div>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      <div className="text-white font-medium">{ord.customerName}</div>
                                      <div className="text-[11px] text-[#8B8B9E] font-mono-tabular">{ord.customerPhone}</div>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono-tabular text-white font-medium">
                                      ₹{ord.total.toLocaleString('en-IN')}
                                    </td>
                                    <td className="py-3 px-4">
                                      <select
                                        value={ord.status}
                                        onChange={(e) => handleUpdateOrder(ord.id, { status: e.target.value })}
                                        className="rounded border border-[#2A2A38] bg-[#09090D] px-2 py-1 text-xs text-white"
                                      >
                                        {['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested'].map((st) => (
                                          <option key={st} value={st}>
                                            {st.replace(/_/g, ' ')}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-3 px-4">
                                      <select
                                        value={ord.deliveryPartnerId ?? ''}
                                        onChange={(e) =>
                                          handleUpdateOrder(ord.id, {
                                            deliveryPartnerId: e.target.value ? Number(e.target.value) : null,
                                          })
                                        }
                                        className="rounded border border-[#2A2A38] bg-[#09090D] px-2 py-1 text-xs text-white"
                                      >
                                        <option value="">Unassigned</option>
                                        {ownerData.deliveryPartners.map((dp) => (
                                          <option key={dp.id} value={dp.id}>
                                            {dp.name} ({dp.available ? 'Available' : 'Busy'})
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <div className="inline-flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedOrderDetail(ord)}
                                          className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline"
                                          title="View complete order details & actions"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Details</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => onOpenInvoice(ord, ownerData.tenant.name)}
                                          className="inline-flex items-center gap-1 text-[#ECC86A] hover:underline"
                                          title="Print / Save Tax Invoice"
                                        >
                                          <Printer className="w-3.5 h-3.5" />
                                          <span>PDF</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PRODUCTS & INVENTORY */}
                  {ownerSection === 'products' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleSaveProduct}
                        className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">
                              {editingProductId ? `Edit Product #${editingProductId}` : 'Add New Product'}
                            </h3>
                            {editingProductId && (
                              <button
                                type="button"
                                onClick={resetProductForm}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#2A2A38] text-[11px] text-[#A5A5B8] hover:text-white"
                              >
                                <X className="w-3 h-3" /> Cancel Edit
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={aiWritingDesc}
                            onClick={handleAiProductDescription}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D4AF37]/40 text-xs text-[#ECC86A] hover:bg-[#19170E]"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{aiWritingDesc ? 'Writing with Gemini...' : 'Write Description with AI'}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="text"
                            required
                            value={prodName}
                            onChange={(e) => setProdName(e.target.value)}
                            placeholder="Product name"
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={prodCat}
                            onChange={(e) => setProdCat(e.target.value)}
                            placeholder="Category (e.g. Silk Sarees, Mobiles)"
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={prodSubcat}
                            onChange={(e) => setProdSubcat(e.target.value)}
                            placeholder="Subcategory (optional)"
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <div>
                            <label className="block text-[10px] text-[#8E8EA2] mb-1">Selling Price (₹)</label>
                            <input
                              type="number"
                              required
                              min={0}
                              value={prodPrice}
                              onChange={(e) => setProdPrice(Number(e.target.value))}
                              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#8E8EA2] mb-1">Original MRP / Compare-at (₹, optional)</label>
                            <input
                              type="number"
                              min={0}
                              value={prodCompareAt}
                              onChange={(e) => setProdCompareAt(Number(e.target.value))}
                              placeholder="0 for no discount"
                              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#8E8EA2] mb-1">Stock Quantity</label>
                            <input
                              type="number"
                              min={0}
                              value={prodStock}
                              onChange={(e) => setProdStock(Number(e.target.value))}
                              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={prodVariants}
                            onChange={(e) => setProdVariants(e.target.value)}
                            placeholder="Variants: S, M, L or 500g, 1kg or Red, Blue"
                            className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <input
                            type="number"
                            min={0}
                            value={prodWholesale}
                            onChange={(e) => setProdWholesale(Number(e.target.value))}
                            placeholder="Wholesale B2B price ₹ (optional)"
                            className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs font-mono-tabular text-white"
                          />
                          <input
                            type="url"
                            value={prodVideoUrl}
                            onChange={(e) => setProdVideoUrl(e.target.value)}
                            placeholder="Product video URL (optional)"
                            className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                        </div>

                        <input
                          type="text"
                          value={prodSpecs}
                          onChange={(e) => setProdSpecs(e.target.value)}
                          placeholder="Key specs, material, or warranty details (e.g. 1 Year Brand Warranty · 100% Pure Cotton)"
                          className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={prodSku}
                            onChange={(e) => setProdSku(e.target.value)}
                            placeholder="SKU Code (e.g. SLK-RED-001)"
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={prodBarcode}
                            onChange={(e) => setProdBarcode(e.target.value)}
                            placeholder="Barcode / EAN (optional)"
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                        </div>

                        <textarea
                          rows={2}
                          value={prodDesc}
                          onChange={(e) => setProdDesc(e.target.value)}
                          placeholder="Product description..."
                          className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                        />

                        {/* Multi-Image Upload + Flags */}
                        <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-[#C8C8D8]">Product Photos ({prodImages.length}/6)</span>
                            <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#D4AF37]/40 bg-[#14120B] text-[11px] text-[#ECC86A] cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingProdImg ? 'Optimizing...' : 'Upload Product Images'}</span>
                              <input
                                type="file"
                                multiple
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleUploadProductImages}
                                className="hidden"
                              />
                            </label>
                          </div>
                          {prodImages.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {prodImages.map((img, idx) => (
                                <div key={idx} className="relative w-16 h-16 rounded overflow-hidden border border-[#2A2A38]">
                                  <img src={img} alt={`Product ${idx + 1}`} className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => setProdImages((prev) => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/75 text-rose-300"
                                    aria-label="Remove product image"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-white">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prodFeatured}
                                onChange={(e) => setProdFeatured(e.target.checked)}
                                className="accent-[#D4AF37]"
                              />
                              <span>Featured Product</span>
                            </label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prodBestseller}
                                onChange={(e) => setProdBestseller(e.target.checked)}
                                className="accent-[#D4AF37]"
                              />
                              <span>Bestseller Badge</span>
                            </label>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={uploadingProdImg}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
                        >
                          {editingProductId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          <span>{editingProductId ? 'Update Product' : 'Save Product'}</span>
                        </button>
                      </form>

                      {/* Products Toolbar (Search, Filter, Sort, Categories, Import/Export) */}
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-[#20202D] bg-[#0D0D13]">
                        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
                          <div className="relative flex-1 min-w-[180px]">
                            <Search className="w-3.5 h-3.5 text-[#8E8EA2] absolute left-3 top-2.5" />
                            <input
                              type="text"
                              value={prodSearchQuery}
                              onChange={(e) => setProdSearchQuery(e.target.value)}
                              placeholder="Search by name, SKU, or category..."
                              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
                            />
                          </div>
                          <select
                            value={prodCategoryFilter}
                            onChange={(e) => setProdCategoryFilter(e.target.value)}
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="all">All Categories</option>
                            {Array.from(new Set(ownerData.products.map((p) => p.category))).map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <select
                            value={prodStockFilter}
                            onChange={(e) => setProdStockFilter(e.target.value as any)}
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="all">All Stock Statuses</option>
                            <option value="in_stock">In Stock</option>
                            <option value="low_stock">Low Stock (≤5)</option>
                            <option value="out_of_stock">Out of Stock (0)</option>
                            <option value="inactive">Disabled / Inactive</option>
                          </select>
                          <select
                            value={prodSortBy}
                            onChange={(e) => setProdSortBy(e.target.value as any)}
                            className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="name_asc">Sort: Name (A–Z)</option>
                            <option value="price_asc">Sort: Price (Low–High)</option>
                            <option value="price_desc">Sort: Price (High–Low)</option>
                            <option value="stock_asc">Sort: Stock (Low–High)</option>
                          </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCategoryModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/40 bg-[#12121A] text-xs text-[#ECC86A] hover:bg-[#1D1A0F]"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>Manage Categories</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportProductsCsv}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2A2A38] bg-[#08080C] text-xs text-white hover:border-[#D4AF37]"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export CSV</span>
                          </button>
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2A2A38] bg-[#08080C] text-xs text-white hover:border-[#D4AF37] cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Import CSV</span>
                            <input type="file" accept=".csv" onChange={handleImportProductsCsv} className="hidden" />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
                            <tr>
                              <th className="py-2.5 px-4">Product</th>
                              <th className="py-2.5 px-4">SKU / Code</th>
                              <th className="py-2.5 px-4">Category</th>
                              <th className="py-2.5 px-4 text-right">Price / MRP</th>
                              <th className="py-2.5 px-4 text-right">Stock</th>
                              <th className="py-2.5 px-4 text-center">Status</th>
                              <th className="py-2.5 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1C1C28]">
                            {displayedProducts.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-xs text-[#8E8EA2]">
                                  {ownerData.products.length === 0
                                    ? 'No products in store catalog. Use the form above to add your first product!'
                                    : 'No products match your search or filter selection.'}
                                </td>
                              </tr>
                            ) : (
                              displayedProducts.map((p) => (
                                <tr key={p.id} className="hover:bg-[#12121B] transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2.5">
                                      {p.imageUrl && (
                                        <img
                                          src={p.imageUrl}
                                          alt={p.name}
                                          className="w-9 h-9 rounded object-cover border border-[#262634] shrink-0"
                                        />
                                      )}
                                      <div>
                                        <p className="text-white font-medium">{p.name}</p>
                                        <div className="flex gap-1.5 mt-0.5 text-[10px]">
                                          {p.featured && <span className="text-[#ECC86A]">Featured</span>}
                                          {p.bestseller && <span className="text-emerald-400">Bestseller</span>}
                                          {(p.images?.length || 0) > 1 && (
                                            <span className="text-[#8E8EA2]">{p.images?.length} photos</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-mono-tabular text-[#A5A5B8]">
                                    {p.sku || p.barcode || '—'}
                                  </td>
                                  <td className="py-3 px-4 text-[#9A9AAE]">
                                    {p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono-tabular">
                                    <span className="text-white">₹{p.price.toLocaleString('en-IN')}</span>
                                    {p.compareAtPrice > p.price && (
                                      <span className="ml-1.5 text-[10px] text-[#7E7E92] line-through">
                                        ₹{p.compareAtPrice.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={p.stock <= 0}
                                        onClick={async () => {
                                          if (p.stock <= 0) return;
                                          await apiFetch(`/api/products/${p.id}`, {
                                            method: 'PATCH',
                                            body: JSON.stringify({ stock: Math.max(0, p.stock - 1) }),
                                          });
                                          await loadOwnerOverview(selectedTenantId!);
                                        }}
                                        className="px-1.5 py-0.5 rounded border border-[#2A2A38] text-[#B8B8C8] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                        title={p.stock <= 0 ? 'Stock is already 0 or negative; cannot decrease further' : 'Decrease stock by 1'}
                                      >
                                        -1
                                      </button>
                                      <span
                                        className={`font-mono-tabular min-w-[44px] text-center ${
                                          p.stock < 0
                                            ? 'text-rose-400 font-bold bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-800/60'
                                            : p.stock === 0
                                            ? 'text-red-400 font-semibold'
                                            : p.stock <= (p.lowStockThreshold || 5)
                                            ? 'text-amber-400 font-semibold'
                                            : 'text-white'
                                        }`}
                                        title={p.stock < 0 ? 'Oversold inventory alert: Current balance is negative.' : undefined}
                                      >
                                        {p.stock}{' '}
                                        {p.stock < 0
                                          ? '(Oversold)'
                                          : p.stock === 0
                                          ? '(Out)'
                                          : p.stock <= (p.lowStockThreshold || 5)
                                          ? '(Low)'
                                          : ''}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await apiFetch(`/api/products/${p.id}`, {
                                            method: 'PATCH',
                                            body: JSON.stringify({ stock: p.stock + 5 }),
                                          });
                                          await loadOwnerOverview(selectedTenantId!);
                                          onNotify(`Restocked +5 units for ${p.name}.`);
                                        }}
                                        className="px-1.5 py-0.5 rounded border border-[#2A2A38] text-[#ECC86A] hover:border-[#D4AF37]"
                                        title="Restock +5 units"
                                      >
                                        +5
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleProductActive(p)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                        p.active !== false
                                          ? 'border-emerald-600/40 text-emerald-300 hover:bg-emerald-950/30'
                                          : 'border-rose-800/40 text-rose-300 bg-rose-950/40'
                                      }`}
                                      title="Toggle product availability on storefront"
                                    >
                                      {p.active !== false ? 'Active' : 'Disabled'}
                                    </button>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="inline-flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDuplicateProduct(p)}
                                        className="text-[#A5A5B8] hover:text-white"
                                        title="Duplicate product"
                                        aria-label="Duplicate product"
                                      >
                                        <Copy className="w-3.5 h-3.5 inline" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleLoadProductForEdit(p)}
                                        className="text-[#ECC86A] hover:text-white"
                                        title="Edit product"
                                        aria-label="Edit product"
                                      >
                                        <Edit3 className="w-3.5 h-3.5 inline" />
                                      </button>
                                      {confirmDeleteProductId === p.id ? (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
                                              setConfirmDeleteProductId(null);
                                              await loadOwnerOverview(selectedTenantId!);
                                              onNotify('Product removed. Historical orders remain intact.');
                                            }}
                                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-semibold"
                                            title="Confirm deletion (orders remain intact)"
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteProductId(null)}
                                            className="px-1.5 py-0.5 rounded border border-[#2A2A38] text-[10px] text-[#9E9EB2]"
                                          >
                                            No
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteProductId(p.id)}
                                          className="text-rose-400 hover:text-rose-300"
                                          title="Delete product (orders remain intact)"
                                          aria-label="Delete product"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 inline" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* CUSTOMER REVIEWS & RATINGS SUITE */}
                  {ownerSection === 'reviews' && ownerData && (
                    <OwnerReviewsManager
                      tenant={ownerData.tenant}
                      products={ownerData.products || []}
                      onNotify={onNotify}
                    />
                  )}

                  {/* BUSINESS GALLERY MANAGER */}
                  {ownerSection === 'gallery' && (
                    <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
                            <span>Business Photo & Portfolio Gallery ({ownerGalleryDraft.length}/18)</span>
                          </h3>
                          <p className="text-xs text-[#8E8EA2] mt-0.5">
                            Upload storefront photos, restaurant dishes, studio shoots, or product lookbooks. Customers can filter by album and view in full-screen Lightbox.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-[#D4AF37]/40 bg-[#14120B] text-xs text-[#ECC86A] cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload Photos</span>
                            <input
                              type="file"
                              multiple
                              accept="image/png,image/jpeg,image/webp"
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []).slice(0, Math.max(0, 18 - ownerGalleryDraft.length));
                                e.target.value = '';
                                if (files.length === 0) return;
                                try {
                                  const next: GalleryItem[] = [];
                                  for (const file of files) {
                                    const url = await readAndOptimizeImageFile(file, 960);
                                    next.push({
                                      id: `gal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                      url,
                                      title: file.name.replace(/\.[^/.]+$/, '').slice(0, 60),
                                      description: '',
                                      category: 'Showcase',
                                      order: ownerGalleryDraft.length + next.length,
                                    });
                                  }
                                  setOwnerGalleryDraft((prev) => [...prev, ...next].slice(0, 18));
                                  onNotify(`Added ${next.length} photo(s). Click Save Gallery to publish.`);
                                } catch (err) {
                                  onNotify(err instanceof Error ? err.message : 'Unable to upload photo.');
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={savingGallery}
                            onClick={handleSaveOwnerGallery}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingGallery ? 'Saving...' : 'Save Gallery'}</span>
                          </button>
                        </div>
                      </div>

                      {ownerGalleryDraft.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#262636] p-8 text-center text-xs text-[#8E8EA2]">
                          No gallery photos yet. Upload PNG, JPG, or WebP images above to showcase your work.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {ownerGalleryDraft.map((item, idx) => (
                            <div key={item.id} className="flex gap-3 rounded-lg border border-[#20202E] bg-[#09090D] p-3">
                              <img
                                src={item.url}
                                alt={item.title || `Gallery ${idx + 1}`}
                                className="w-20 h-20 rounded object-cover border border-[#2A2A38] shrink-0"
                              />
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={item.title}
                                    onChange={(e) =>
                                      setOwnerGalleryDraft((prev) =>
                                        prev.map((g, i) => (i === idx ? { ...g, title: e.target.value } : g))
                                      )
                                    }
                                    placeholder="Photo title"
                                    className="flex-1 rounded border border-[#252534] bg-[#0D0D14] px-2 py-1 text-xs text-white"
                                  />
                                  <input
                                    type="text"
                                    value={item.category}
                                    onChange={(e) =>
                                      setOwnerGalleryDraft((prev) =>
                                        prev.map((g, i) => (i === idx ? { ...g, category: e.target.value } : g))
                                      )
                                    }
                                    placeholder="Album"
                                    className="w-28 rounded border border-[#252534] bg-[#0D0D14] px-2 py-1 text-xs text-[#ECC86A]"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) =>
                                    setOwnerGalleryDraft((prev) =>
                                      prev.map((g, i) => (i === idx ? { ...g, description: e.target.value } : g))
                                    )
                                  }
                                  placeholder="Description / caption"
                                  className="w-full rounded border border-[#252534] bg-[#0D0D14] px-2 py-1 text-xs text-[#B8B8C8]"
                                />
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (idx === 0) return;
                                      setOwnerGalleryDraft((prev) => {
                                        const c = [...prev];
                                        [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]];
                                        return c;
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded border border-[#252534] text-[11px] text-[#9E9EB2] hover:text-white"
                                  >
                                    <ArrowUp className="w-3 h-3 inline" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (idx === ownerGalleryDraft.length - 1) return;
                                      setOwnerGalleryDraft((prev) => {
                                        const c = [...prev];
                                        [c[idx + 1], c[idx]] = [c[idx], c[idx + 1]];
                                        return c;
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded border border-[#252534] text-[11px] text-[#9E9EB2] hover:text-white"
                                  >
                                    <ArrowDown className="w-3 h-3 inline" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOwnerGalleryDraft((prev) => prev.filter((_, i) => i !== idx))}
                                    className="ml-auto px-2 py-0.5 rounded border border-rose-500/30 text-[11px] text-rose-400"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* REAL CUSTOMERS DIRECTORY (FROM REAL ORDERS) */}
                  {ownerSection === 'customers' && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-hidden">
                        <div className="p-4 border-b border-[#1E1E2A] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="w-3.5 h-3.5 text-[#8E8EA2] absolute left-3 top-2.5" />
                              <input
                                type="text"
                                value={customerSearchQuery}
                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                placeholder="Search customers by name, phone, or email..."
                                className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleExportCustomersCsv}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2A2A38] bg-[#08080C] text-xs text-white hover:border-[#D4AF37]"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Export Customers CSV</span>
                            </button>
                          </div>
                        </div>

                        {displayedCustomers.length === 0 ? (
                          <p className="p-8 text-center text-xs text-[#8E8EA2]">
                            {ownerCustomers.length === 0
                              ? 'No customer orders recorded yet. Customers appear here automatically when real orders are placed on your storefront.'
                              : 'No customer records match your search query.'}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
                                <tr>
                                  <th className="py-2.5 px-4">Customer Name</th>
                                  <th className="py-2.5 px-4">Phone</th>
                                  <th className="py-2.5 px-4">Email</th>
                                  <th className="py-2.5 px-4 text-right">Orders</th>
                                  <th className="py-2.5 px-4 text-right">Total Spend</th>
                                  <th className="py-2.5 px-4 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#1C1C28]">
                                {displayedCustomers.map((cust, i) => (
                                  <tr
                                    key={i}
                                    onClick={() => setSelectedCustomerProfile(cust)}
                                    className="hover:bg-[#12121B] transition-colors cursor-pointer"
                                  >
                                    <td className="py-3 px-4 text-white font-medium">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-[#1A1A26] border border-[#2A2A38] flex items-center justify-center text-[10px] text-[#D4AF37] font-bold shrink-0">
                                          {cust.name.slice(0, 1).toUpperCase()}
                                        </div>
                                        <span>{cust.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 font-mono-tabular text-[#C8C8D8]">{cust.phone}</td>
                                    <td className="py-3 px-4 text-[#9E9EB2]">{cust.email}</td>
                                    <td className="py-3 px-4 text-right font-mono-tabular text-white">{cust.ordersCount}</td>
                                    <td className="py-3 px-4 text-right font-mono-tabular text-[#ECC86A] font-medium">
                                      ₹{cust.totalSpent.toLocaleString('en-IN')}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedCustomerProfile(cust);
                                        }}
                                        className="inline-flex items-center gap-1 text-[#D4AF37] hover:underline"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Profile</span>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* QUICK STORE SETTINGS, PAYMENTS & MODULES */}
                  {ownerSection === 'store_settings' && settingsDraft && (
                    <form
                      onSubmit={handleSaveOwnerSettings}
                      className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Settings className="w-4 h-4 text-[#D4AF37]" />
                          <span>Storefront Payments, Delivery, Policies & Active Modules</span>
                        </h3>
                        <button
                          type="submit"
                          disabled={savingSettings}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[#9D9DB0] mb-1">Direct UPI ID (for UPI Checkout)</label>
                          <input
                            type="text"
                            value={settingsDraft.upiId}
                            onChange={(e) => setSettingsDraft({ ...settingsDraft, upiId: e.target.value })}
                            placeholder="yourbusiness@upi"
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[#9D9DB0] mb-1">Standard Delivery Charge (₹)</label>
                          <input
                            type="number"
                            min={0}
                            value={settingsDraft.deliveryFee}
                            onChange={(e) => setSettingsDraft({ ...settingsDraft, deliveryFee: Number(e.target.value) })}
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 font-mono-tabular text-white"
                          />
                        </div>
                        <div className="flex items-end pb-2">
                          <label className="inline-flex items-center gap-2 text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsDraft.codEnabled}
                              onChange={(e) => setSettingsDraft({ ...settingsDraft, codEnabled: e.target.checked })}
                              className="accent-[#D4AF37]"
                            />
                            <span>Enable Cash on Delivery (COD)</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[#9D9DB0] mb-1">Business Hours</label>
                          <input
                            type="text"
                            value={settingsDraft.businessHours}
                            onChange={(e) => setSettingsDraft({ ...settingsDraft, businessHours: e.target.value })}
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[#9D9DB0] mb-1">Delivery Information</label>
                          <input
                            type="text"
                            value={settingsDraft.deliveryInfo}
                            onChange={(e) => setSettingsDraft({ ...settingsDraft, deliveryInfo: e.target.value })}
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[#9D9DB0] mb-1">Return & Cancellation Policy</label>
                          <input
                            type="text"
                            value={settingsDraft.returnPolicy}
                            onChange={(e) => setSettingsDraft({ ...settingsDraft, returnPolicy: e.target.value })}
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                          />
                        </div>
                      </div>

                      <div className="border-t border-[#1E1E2B] pt-4">
                        <p className="text-xs font-semibold text-white mb-2.5">Enabled Storefront Modules</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {(
                            [
                              ['ecommerce', 'Product Catalog'],
                              ['cartCheckout', 'Cart & Checkout'],
                              ['gallery', 'Photo Gallery'],
                              ['bookings', 'Appointments / Bookings'],
                              ['whatsappOrder', 'WhatsApp Orders'],
                              ['reviews', 'Customer Reviews'],
                              ['wishlist', 'Wishlist'],
                              ['coupons', 'Promo Coupons'],
                              ['wholesale', 'Wholesale Pricing'],
                            ] as Array<[keyof TenantModules, string]>
                          ).map(([key, label]) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 rounded border border-[#222230] bg-[#09090D] px-3 py-2 text-white cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={settingsDraft.enabledModules[key]}
                                onChange={(e) =>
                                  setSettingsDraft({
                                    ...settingsDraft,
                                    enabledModules: {
                                      ...settingsDraft.enabledModules,
                                      [key]: e.target.checked,
                                    },
                                  })
                                }
                                className="accent-[#D4AF37]"
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </form>
                  )}

                  {/* OWNER PROFILE & BRAND CONTACT DETAILS */}
                  {ownerSection === 'owner_profile' && (
                    <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-6 space-y-6 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E1E2B] pb-4">
                        <div>
                          <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <Shield className="w-4 h-4 text-[#D4AF37]" />
                            <span>Owner & Official Brand Profile</span>
                          </h3>
                          <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                            Manage official Vijay Visuals contact details, phone dialers, and notification emails.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <img
                            src="/logo.png"
                            alt="VIJAY VISUALS"
                            className="w-8 h-8 rounded border border-[#D4AF37]/50 object-contain bg-black"
                          />
                          <span className="font-extrabold text-sm text-[#D4AF37] tracking-wider">VIJAY VISUALS</span>
                        </div>
                      </div>

                      <form onSubmit={handleSaveOwnerProfile} className="space-y-4 max-w-xl">
                        <div>
                          <label className="block text-[#9D9DB0] mb-1 font-semibold">Official Business / Owner Name</label>
                          <input
                            type="text"
                            required
                            value={ownerEditName}
                            onChange={(e) => setOwnerEditName(e.target.value)}
                            placeholder="VIJAY VISUALS"
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[#9D9DB0] mb-1 font-semibold">Official Mobile (Voice & WhatsApp)</label>
                            <input
                              type="tel"
                              required
                              value={ownerEditPhone}
                              onChange={(e) => setOwnerEditPhone(e.target.value)}
                              placeholder="+91 9381362201"
                              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
                            />
                          </div>

                          <div>
                            <label className="block text-[#9D9DB0] mb-1 font-semibold">Official Email</label>
                            <input
                              type="email"
                              required
                              value={ownerEditEmail}
                              onChange={(e) => setOwnerEditEmail(e.target.value)}
                              placeholder="vk66278@gmail.com"
                              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex items-center gap-3">
                          <button
                            type="submit"
                            disabled={savingOwnerProfile}
                            className="px-5 py-2.5 rounded-lg bg-gold-gradient text-[#08080A] font-bold text-xs hover:opacity-95 transition-opacity"
                          >
                            {savingOwnerProfile ? 'Saving...' : 'Save Owner Profile'}
                          </button>
                        </div>
                      </form>

                      {/* Clickable Verification Strip */}
                      <div className="rounded-lg border border-[#242436] bg-[#09090E] p-4 space-y-2">
                        <p className="text-[11px] font-bold text-white uppercase tracking-wider">Clickable Verification Links:</p>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <a
                            href={`tel:${ownerEditPhone.replace(/\s+/g, '') || '+919381362201'}`}
                            className="inline-flex items-center gap-1.5 text-emerald-400 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call: {ownerEditPhone || '+91 9381362201'}</span>
                          </a>
                          <a
                            href={`https://wa.me/${(ownerEditPhone || '919381362201').replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-emerald-400 hover:underline"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp Message</span>
                          </a>
                          <a
                            href={`mailto:${ownerEditEmail || 'vk66278@gmail.com'}`}
                            className="inline-flex items-center gap-1.5 text-[#ECC86A] hover:underline"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email: {ownerEditEmail || 'vk66278@gmail.com'}</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DELIVERY FLEET & STAFF */}
                  {ownerSection === 'team' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-4">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Truck className="w-4 h-4 text-[#D4AF37]" />
                          <span>Delivery Fleet ({ownerData.deliveryPartners.length})</span>
                        </h3>
                        <form onSubmit={handleAddOwnerRider} className="space-y-2.5">
                          <input
                            type="text"
                            required
                            value={riderName}
                            onChange={(e) => setRiderName(e.target.value)}
                            placeholder="Delivery partner name"
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="tel"
                              required
                              value={riderPhone}
                              onChange={(e) => setRiderPhone(e.target.value)}
                              placeholder="Phone"
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                            />
                            <input
                              type="text"
                              value={riderVehicle}
                              onChange={(e) => setRiderVehicle(e.target.value)}
                              placeholder="Vehicle"
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                            />
                          </div>
                          <button type="submit" className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold">
                            Add Delivery Partner
                          </button>
                        </form>
                        <div className="divide-y divide-[#1D1D28] text-xs">
                          {ownerData.deliveryPartners.map((dp) => (
                            <div key={dp.id} className="py-2.5 flex items-center justify-between">
                              <div>
                                <p className="text-white font-medium">{dp.name}</p>
                                <p className="text-[#8E8EA2]">
                                  {dp.phone} · {dp.vehicleType}
                                </p>
                              </div>
                              <div className="text-right font-mono-tabular">
                                <p className={dp.available ? 'text-emerald-400' : 'text-[#8E8EA2]'}>
                                  {dp.available ? 'Available' : 'Offline'}
                                </p>
                                <p className="text-[#ECC86A]">
                                  {dp.totalDeliveries} trips · ₹{dp.totalEarnings.toLocaleString('en-IN')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-4">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#D4AF37]" />
                          <span>Business Staff ({ownerData.staff.length})</span>
                        </h3>
                        <form onSubmit={handleAddStaff} className="space-y-2.5">
                          <input
                            type="text"
                            required
                            value={staffName}
                            onChange={(e) => setStaffName(e.target.value)}
                            placeholder="Staff full name"
                            className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="email"
                              required
                              value={staffEmail}
                              onChange={(e) => setStaffEmail(e.target.value)}
                              placeholder="Email"
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                            />
                            <select
                              value={staffRole}
                              onChange={(e) => setStaffRole(e.target.value as typeof staffRole)}
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-xs text-white"
                            >
                              <option value="store_manager">Store Manager</option>
                              <option value="inventory_clerk">Inventory Clerk</option>
                              <option value="support_agent">Support Agent</option>
                            </select>
                          </div>
                          <button type="submit" className="px-4 py-2 rounded border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-semibold">
                            Invite Staff Member
                          </button>
                        </form>
                        <div className="divide-y divide-[#1D1D28] text-xs">
                          {ownerData.staff.map((st) => (
                            <div key={st.id} className="py-2.5 flex items-center justify-between">
                              <div>
                                <p className="text-white font-medium">{st.name}</p>
                                <p className="text-[#8E8EA2]">{st.email}</p>
                              </div>
                              <span className="capitalize text-[#ECC86A]">{st.staffRole.replace('_', ' ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* COUPONS & LICENSE INFO */}
                  {ownerSection === 'marketing' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-4">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Tag className="w-4 h-4 text-[#D4AF37]" />
                          <span>Promotional Coupons</span>
                        </h3>
                        <form onSubmit={handleCreateCoupon} className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            required
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            placeholder="FESTIVE15"
                            className="flex-1 min-w-[110px] rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white uppercase"
                          />
                          <select
                            value={couponType}
                            onChange={(e) => setCouponType(e.target.value as 'percent' | 'flat')}
                            className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-xs text-white"
                          >
                            <option value="percent">% Off</option>
                            <option value="flat">₹ Flat</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={couponVal}
                            onChange={(e) => setCouponVal(Number(e.target.value))}
                            title="Discount value"
                            className="w-20 rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-xs font-mono-tabular text-white"
                          />
                          <input
                            type="number"
                            min={0}
                            value={couponMinOrder}
                            onChange={(e) => setCouponMinOrder(Number(e.target.value))}
                            placeholder="Min ₹"
                            title="Minimum order amount"
                            className="w-24 rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-xs font-mono-tabular text-white"
                          />
                          <button type="submit" className="px-3.5 py-2 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold">
                            Create
                          </button>
                        </form>
                        <div className="divide-y divide-[#1D1D28] text-xs">
                          {ownerData.coupons.map((c) => (
                            <div key={c.id} className="py-2 flex items-center justify-between gap-2">
                              <span className="font-mono-tabular text-[#ECC86A] font-semibold">{c.code}</span>
                              <span className="text-[#A5A5B8]">
                                {c.discountType === 'percent' ? `${c.discountValue}% off` : `₹${c.discountValue} off`} · Min ₹{c.minOrder}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteCoupon(c.id)}
                                className="text-rose-400 hover:text-rose-300"
                                aria-label={`Delete coupon ${c.code}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3 text-xs">
                        <h3 className="text-sm font-semibold text-white">Subscription & PWA License</h3>
                        <div className="flex justify-between py-1.5 border-b border-[#1D1D28]">
                          <span className="text-[#8E8EA2]">Active Tier</span>
                          <span className="text-white uppercase">{ownerData.tenant.planTier.replace('_', ' ')}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-[#1D1D28]">
                          <span className="text-[#8E8EA2]">Optional Branded PWA</span>
                          <span className={ownerData.tenant.pwaEnabled ? 'text-emerald-400' : 'text-[#8E8EA2]'}>
                            {ownerData.tenant.pwaEnabled ? 'Licensed & Active' : 'Not Enabled (Website-Only)'}
                          </span>
                        </div>
                        {ownerData.tenant.pwaLicenseKey && (
                          <div className="flex justify-between py-1.5 border-b border-[#1D1D28]">
                            <span className="text-[#8E8EA2]">Server License Key</span>
                            <span className="font-mono-tabular text-[#ECC86A]">{ownerData.tenant.pwaLicenseKey}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-1.5">
                          <span className="text-[#8E8EA2]">Delivery Commission Rate</span>
                          <span className="font-mono-tabular text-white">{ownerData.tenant.deliveryCommissionPct}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {(ownerSection === 'payments' ||
                    ownerSection === 'crm_bookings' ||
                    ownerSection === 'finance' ||
                    ownerSection === 'supply_hr' ||
                    ownerSection === 'plugins_dns') && (
                    <OwnerOperationsSuite
                      tenant={ownerData.tenant}
                      staff={ownerData.staff}
                      activeSection={ownerSection}
                      onRefreshTenant={() => {
                        if (selectedTenantId) loadOwnerOverview(selectedTenantId);
                        onRefreshTenants();
                      }}
                      onNotify={onNotify}
                    />
                  )}

                  {(ownerSection === 'domains_dns' ||
                    ownerSection === 'seo_growth' ||
                    ownerSection === 'proposals_quotes' ||
                    ownerSection === 'subscription_policy') && (
                    <GrowthWorkspace
                      tenant={ownerData.tenant}
                      activeTab={ownerSection}
                      onNotify={onNotify}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-8 text-xs text-[#8E8EA2]">
                  Loading business dashboard metrics...
                </div>
              )}
            </>
          )}

          {/* ================= DELIVERY PARTNER PORTAL (MODULE 3) ================= */}
          {roleTab === 'delivery' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-[#D4AF37]">Module 3 · Delivery Assignment, Pickup & Earnings</p>
                <h1 className="font-luxury text-2xl font-bold text-white">Delivery Partner Portal</h1>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">My Delivery Profiles & Availability</h2>
                  {deliveryData.partners.length === 0 ? (
                    <p className="text-xs text-[#8E8EA2]">You are not registered as a delivery partner yet. Register on the right to start receiving deliveries.</p>
                  ) : (
                    <div className="space-y-3">
                      {deliveryData.partners.map((p) => (
                        <div key={p.id} className="rounded-lg border border-[#222230] bg-[#09090D] p-3.5 flex items-center justify-between text-xs">
                          <div>
                            <p className="text-white font-semibold">{p.name}</p>
                            <p className="text-[#8E8EA2]">{p.vehicleType} · {p.phone}</p>
                            <p className="font-mono-tabular text-[#ECC86A] mt-1">
                              {p.totalDeliveries} completed · ₹{p.totalEarnings.toLocaleString('en-IN')} earned
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/delivery/partners/${p.id}/availability`, {
                                method: 'PATCH',
                                body: JSON.stringify({ available: !p.available }),
                              });
                              await loadDeliveryPortal();
                            }}
                            className={`px-3 py-1.5 rounded-md font-semibold ${
                              p.available ? 'bg-emerald-600 text-white' : 'border border-[#2C2C3C] text-[#A3A3B5]'
                            }`}
                          >
                            {p.available ? 'Online / Available' : 'Offline'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={handleJoinDeliveryFleet} className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Register as Delivery Partner</h2>
                  <select
                    value={joinTenantId}
                    onChange={(e) => setJoinTenantId(Number(e.target.value))}
                    className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                  >
                    {allTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    value={joinPhone}
                    onChange={(e) => setJoinPhone(e.target.value)}
                    placeholder="Mobile number"
                    className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={joinVehicle}
                    onChange={(e) => setJoinVehicle(e.target.value)}
                    placeholder="Vehicle type (Bike, Scooter, Van)"
                    className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                  />
                  <button type="submit" className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold">
                    Join Delivery Fleet
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1E1E2B] flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">Assigned Deliveries ({deliveryData.assignedOrders.length})</h2>
                  <span className="text-[11px] text-[#8E8EA2]">
                    Milestone status, POD & optional consent-based battery-efficient GPS sharing active
                  </span>
                </div>
                {deliveryData.assignedOrders.length === 0 ? (
                  <p className="p-8 text-center text-xs text-[#8E8EA2]">No deliveries assigned yet. Business owners assign orders from the Owner Dashboard.</p>
                ) : (
                  <div className="divide-y divide-[#1D1D28]">
                    {deliveryData.assignedOrders.map((ord) => (
                      <div key={ord.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div>
                          <p className="font-mono-tabular text-[#ECC86A] font-semibold">
                            {ord.orderNumber} · {ord.paymentMethod.toUpperCase()} ({ord.paymentStatus.replace(/_/g, ' ')})
                          </p>
                          <p className="text-white mt-0.5">{ord.customerName} · {ord.customerPhone}</p>
                          <p className="text-[#8E8EA2]">{ord.shippingAddress}</p>
                          <p className="text-emerald-400 font-mono-tabular mt-1">
                            Commission: ₹{ord.deliveryCommission} · Order Total: ₹{ord.total.toLocaleString('en-IN')}
                          </p>
                          {ord.notes && (
                            <p className="text-[11px] text-[#A8A8BC] mt-1 whitespace-pre-wrap">{ord.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {['ready_for_pickup', 'out_for_delivery', 'delivered'].map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/delivery/orders/${ord.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: st }),
                                });
                                await loadDeliveryPortal();
                                onNotify(`Delivery marked ${st.replace(/_/g, ' ')}.`);
                              }}
                              className={`px-3 py-1.5 rounded text-xs font-medium capitalize ${
                                ord.status === st
                                  ? 'bg-[#D4AF37] text-[#08080A]'
                                  : 'border border-[#2A2A38] text-[#B4B4C6] hover:text-white'
                              }`}
                            >
                              {st.replace(/_/g, ' ')}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/delivery/orders/${ord.id}/pod`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  recipientName: ord.customerName,
                                  podCode: `POD-${ord.orderNumber.slice(-4)}`,
                                  codCollected: ord.paymentMethod === 'cod',
                                  status: 'delivered',
                                }),
                              });
                              await loadDeliveryPortal();
                              onNotify(
                                ord.paymentMethod === 'cod'
                                  ? `Proof of Delivery & COD ₹${ord.total} collection recorded.`
                                  : 'Proof of Delivery recorded.'
                              );
                            }}
                            className="px-3 py-1.5 rounded bg-emerald-600/90 text-white text-xs font-semibold hover:bg-emerald-500"
                          >
                            {ord.paymentMethod === 'cod' ? 'Confirm POD & COD Collected' : 'Record POD'}
                          </button>
                        </div>
                        <div className="w-full">
                          <DeliveryGpsSharer
                            orderId={ord.id}
                            orderNumber={ord.orderNumber}
                            orderStatus={ord.status}
                            onNotify={onNotify}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= CUSTOMER DASHBOARD (MODULE 4) ================= */}
          {roleTab === 'customer' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-[#D4AF37]">Customer Workspace · Website Management, Packages &amp; Orders</p>
                <h1 className="font-luxury text-2xl font-bold text-white">Customer Dashboard</h1>
              </div>

              {/* 1. My Websites & Management Access */}
              <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#D4AF37]" />
                      <span>My Websites &amp; Storefronts ({ownedTenants.length})</span>
                    </h2>
                    <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                      Each customer has isolated access to manage only their own website design, catalog, and orders.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoBuilder()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold hover:opacity-95 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create / Edit in Builder</span>
                  </button>
                </div>

                {ownedTenants.length === 0 ? (
                  <div className="rounded-lg border border-[#1E1E2C] bg-[#08080C] p-6 text-center space-y-3">
                    <p className="text-xs text-[#9E9EB2]">
                      You have not created a business website yet. Purchase the ₹7,999 Business Website Package to get full management access to your custom website.
                    </p>
                    <button
                      type="button"
                      onClick={() => onGoBuilder()}
                      className="px-4 py-2 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-medium hover:bg-[#D4AF37] hover:text-[#08080A] transition-colors"
                    >
                      Start Free Draft in Website Builder
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ownedTenants.map((t) => {
                      const isLive = t.published !== false;
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-[#222232] bg-[#0A0A0F] p-4 flex flex-col justify-between space-y-3"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <h3 className="text-xs font-bold text-white truncate">{t.name}</h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  isLive
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {isLive ? 'Live / Published' : 'Draft / Unpublished'}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono-tabular text-[#D4AF37] truncate">/site/{t.slug}</p>
                            <p className="text-[10px] text-[#7E7E92] mt-0.5 capitalize">{t.category || 'General Store'}</p>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-[#1C1C28]">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTenantId(t.id);
                                setRoleTab('owner');
                              }}
                              className="w-full py-1.5 rounded bg-gold-gradient text-[#08080A] text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-95 shadow-sm"
                            >
                              <Building2 className="w-3 h-3" />
                              <span>Manage Website Dashboard</span>
                            </button>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => onGoBuilder(t.id)}
                                className="py-1 px-2 rounded border border-[#262638] text-[11px] text-[#A5A5B8] hover:text-white hover:border-[#D4AF37]/40 text-center"
                              >
                                Edit Builder
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenStorefront(t.slug)}
                                className="py-1 px-2 rounded border border-[#262638] text-[11px] text-[#ECC86A] hover:underline flex items-center justify-center gap-1"
                              >
                                <span>Preview</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. My Package & Active Subscriptions */}
              <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                      <span>My Website Package &amp; Platform Subscriptions</span>
                    </h2>
                    <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                      Platform package status for your independent website operations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRenewPackage()}
                    disabled={buyingPackage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D4AF37]/60 text-[#ECC86A] text-xs font-semibold hover:bg-[#D4AF37] hover:text-[#08080A] transition-colors disabled:opacity-50"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{buyingPackage ? 'Opening Cashfree...' : 'Renew / Upgrade Package'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-[#1E1E2C] bg-[#08080C] p-4 space-y-2">
                    <span className="text-[10px] text-[#8E8EA0] uppercase tracking-wider">Package Status</span>
                    <p className="font-luxury text-base font-bold text-white">
                      {packageStatus?.planName || 'No package selected'}
                    </p>
                    <p className="font-mono-tabular text-sm text-[#ECC86A] font-semibold">
                      {packageStatus?.amountInr
                        ? `₹${packageStatus.amountInr.toLocaleString('en-IN')} verified payment`
                        : 'No verified payment recorded'}
                    </p>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${getPackageStatusClass(packageStatus?.packageStatus || 'none')}`}>
                      Entitlement: {(packageStatus?.packageStatus || 'none').toUpperCase()}
                    </span>
                    {packageStatus?.currentPeriodEnd && (
                      <p className="text-[10px] text-[#8A8A9E]">
                        Current period ends {new Date(packageStatus.currentPeriodEnd).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#1E1E2C] bg-[#08080C] p-4 space-y-1.5 text-[11px]">
                    <span className="text-[10px] text-[#8E8EA0] uppercase tracking-wider block mb-1">Included Entitlements</span>
                    <p className="text-[#C2C2D4] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Exclusive website management dashboard</span>
                    </p>
                    <p className="text-[#C2C2D4] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Edit colors, banners, fonts &amp; layout</span>
                    </p>
                    <p className="text-[#C2C2D4] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Catalog, pricing &amp; customer orders</span>
                    </p>
                    <p className="text-[#C2C2D4] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>Custom domain linking &amp; live publishing</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 space-y-1.5 text-[10px] text-[#C4B79A] leading-relaxed">
                    <span className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider block mb-1">
                      Package Boundaries
                    </span>
                    <p>• <strong>Custom Domain:</strong> Customer provides own domain (registrar fees paid directly).</p>
                    <p>• <strong>Seller Payments:</strong> Store checkout payments are processed through Cashfree PG.</p>
                    <p>• <strong>Platform Hosting:</strong> Cloudflare edge hosting included under platform arrangement.</p>
                  </div>
                </div>
              </div>

              {/* 3. Vijay Visuals Platform Payment Receipts & Invoices */}
              <div className="rounded-xl border border-[#222230] bg-[#0D0D13] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1E1E2B] flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#D4AF37]" />
                    <span>Vijay Visuals Platform Payment History &amp; Invoices ({platformPayments.length})</span>
                  </h2>
                  <span className="text-[10px] text-[#7E7E92]">Authoritative GST Receipts</span>
                </div>

                {platformPayments.length === 0 ? (
                  <p className="p-6 text-center text-xs text-[#8E8EA2]">
                    No platform payments recorded yet under {profile.email}. Once you purchase a package, your official GST tax invoices will appear here.
                  </p>
                ) : (
                  <div className="divide-y divide-[#1D1D28]">
                    {platformPayments.map((pay) => {
                      const receiptNo = getReceiptNumber(pay);
                      const planName = getPlanName(pay);
                      const grandTotal = getGrandTotal(pay);
                      const payDate = getPaymentDate(pay);
                      const paymentId = getPaymentId(pay);
                      const dateFormatted = payDate && !isNaN(new Date(payDate).getTime())
                        ? new Date(payDate).toLocaleDateString('en-IN')
                        : 'Date Unavailable';

                      // Entitlement comes from the linked D1 entitlement row, never
                      // from stale human-readable notes written at checkout time.
                      const entitlementStatus = String(pay.entitlement_status || '').toLowerCase();
                      const paymentStatus = String(pay.status || '').toLowerCase();
                      const deliveryState: string =
                        entitlementStatus === 'active'
                          ? 'ACTIVE'
                          : entitlementStatus === 'revoked' || paymentStatus === 'refunded'
                            ? 'REFUNDED'
                            : paymentStatus === 'failed'
                              ? 'FAILED'
                              : paymentStatus === 'paid' && Number(pay.signature_verified) === 1
                                ? 'ACTIVE'
                                : 'PAYMENT_PENDING';
                      let payNotes: Record<string, any> = {};
                      try {
                        payNotes = JSON.parse(pay.notes_json || '{}');
                      } catch {}
                      const siteUrl = payNotes.websiteUrl || (pay.website_id ? `/site/${pay.public_slug || pay.website_id}` : null);

                      return (
                        <div key={pay.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                          <div>
                            <p className="font-mono-tabular text-[#ECC86A] font-semibold">
                              {receiptNo} · {planName} {grandTotal !== null ? `· ₹${grandTotal.toLocaleString('en-IN')}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-[#9E9EB2] mt-0.5">
                              <span>
                                Status:{' '}
                                <strong className={paymentStatus === 'paid' ? 'text-emerald-400 capitalize' : 'text-rose-400 capitalize'}>
                                  {pay.status || 'Unknown'}
                                </strong>{' '}
                                · Date: {dateFormatted}
                                {paymentStatus === 'paid' && Number(pay.signature_verified) !== 1 && (
                                  <span className="ml-1 text-amber-300">· verification pending</span>
                                )}
                              </span>
                              {deliveryState === 'ACTIVE' || deliveryState === 'DELIVERY_READY' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Delivered · Active</span>
                                </span>
                              ) : deliveryState === 'DELIVERY_FAILED' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-medium">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Delivery Pending</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 font-medium">
                                  <Clock className="w-3 h-3" />
                                  <span>Provisioning...</span>
                                </span>
                              )}
                              {paymentId && (
                                <span className="font-mono-tabular text-[10px] text-[#7E7E92]">
                                  Ref: {paymentId}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {deliveryState === 'DELIVERY_FAILED' && (
                              <button
                                type="button"
                                disabled={retryingCustDeliveryId === pay.id}
                                onClick={() => handleCustomerRetryDelivery(pay.id)}
                                className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold hover:opacity-95 transition-opacity disabled:opacity-50"
                              >
                                {retryingCustDeliveryId === pay.id ? 'Retrying...' : 'Retry Website Delivery'}
                              </button>
                            )}
                            {siteUrl && (
                              <a
                                href={siteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded border border-[#2B2B3C] bg-[#12121A] text-white text-xs font-medium hover:border-[#D4AF37] transition-colors inline-flex items-center gap-1"
                              >
                                <span>Open Website</span>
                                <ExternalLink className="w-3 h-3 text-[#D4AF37]" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedReceipt(pay)}
                              className="px-3 py-1.5 rounded border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-medium hover:bg-[#D4AF37] hover:text-[#08080A] transition-colors"
                            >
                              View Platform Tax Invoice
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Profile & Saved Addresses</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Full Name"
                      className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="Mobile Number"
                      className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white font-mono-tabular"
                    />
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="Email Address"
                      className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Add new delivery address..."
                      className="flex-1 rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newAddress.trim()) return;
                        const next = [...savedAddresses, newAddress.trim()];
                        setSavedAddresses(next);
                        setNewAddress('');
                        handleSaveProfile(next);
                      }}
                      className="px-3 py-2 rounded border border-[#D4AF37]/50 text-[#ECC86A] text-xs"
                    >
                      Add
                    </button>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[#B4B4C6]">
                    {savedAddresses.map((addr, idx) => (
                      <li key={idx} className="flex justify-between items-center rounded bg-[#09090D] border border-[#1E1E2A] px-3 py-2">
                        <span>{addr}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = savedAddresses.filter((_, i) => i !== idx);
                            setSavedAddresses(next);
                            handleSaveProfile(next);
                          }}
                          className="text-rose-400 text-[11px]"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => handleSaveProfile()}
                    className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold"
                  >
                    Save Profile
                  </button>
                </div>

                <form onSubmit={handleCustomerTicket} className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Support & Complaints</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="Subject / Order ID"
                      className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                    />
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value as typeof ticketCategory)}
                      className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-xs text-white"
                    >
                      <option value="order_issue">Order Issue</option>
                      <option value="refund">Return / Refund</option>
                      <option value="platform_support">Platform Support</option>
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={ticketMsg}
                    onChange={(e) => setTicketMsg(e.target.value)}
                    placeholder="Describe your request..."
                    className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
                  />
                  <button type="submit" className="px-4 py-2 rounded border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-semibold">
                    Submit Support Ticket
                  </button>
                  {customerTickets.length > 0 && (
                    <div className="pt-2 border-t border-[#1E1E2A] space-y-1.5 text-xs">
                      {customerTickets.slice(0, 3).map((t) => (
                        <div key={t.id} className="flex justify-between text-[#A5A5B8]">
                          <span className="truncate">{t.subject}</span>
                          <span className="capitalize text-[#ECC86A]">{t.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <h2 className="text-sm font-semibold text-white">Saved Wishlist ({wishlistIds.length} items)</h2>
                  <p className="text-[#8E8EA2] mt-0.5">
                    {wishlistIds.length === 0
                      ? 'Tap the heart icon on any storefront product to save items for later.'
                      : `Saved Product IDs: ${wishlistIds.map((id) => `#${id}`).join(', ')}`}
                  </p>
                </div>
                {wishlistIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => wishlistIds.forEach((id) => onToggleWishlist(id))}
                    className="px-3 py-1.5 rounded border border-[#2A2A38] text-[#A5A5B8] hover:text-white"
                  >
                    Clear Wishlist
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1E1E2B]">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#D4AF37]" />
                    <span>My Orders & Payment History ({customerOrders.length})</span>
                  </h2>
                </div>
                {customerOrders.length === 0 ? (
                  <p className="p-8 text-center text-xs text-[#8E8EA2]">
                    No orders placed under {profile.email} yet. Browse the Marketplace to place an order.
                  </p>
                ) : (
                  <div className="divide-y divide-[#1D1D28]">
                    {customerOrders.map((ord) => {
                      const storeName =
                        allTenants.find((t) => t.id === ord.tenantId)?.name || 'Vijay Visuals Store';
                      return (
                      <div key={ord.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div>
                          <p className="font-mono-tabular text-[#ECC86A] font-semibold">
                            {ord.orderNumber} · {storeName} · ₹{ord.total.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[#9E9EB2] mt-0.5 capitalize">
                            Status: <strong className="text-white">{ord.status.replace(/_/g, ' ')}</strong> · Payment: {ord.paymentMethod} ({ord.paymentStatus})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(ord, storeName)}
                            className="px-3 py-1.5 rounded border border-[#2B2B3B] text-[#E8E8ED] hover:border-[#D4AF37]"
                          >
                            Invoice
                          </button>
                          {['confirmed', 'preparing'].includes(ord.status) && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/customer/orders/${ord.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ action: 'cancel' }),
                                });
                                await loadCustomerDashboard();
                                onNotify('Order cancelled.');
                              }}
                              className="px-3 py-1.5 rounded border border-rose-500/40 text-rose-300"
                            >
                              Cancel
                            </button>
                          )}
                          {ord.status === 'delivered' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/customer/orders/${ord.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ action: 'return' }),
                                });
                                await loadCustomerDashboard();
                                onNotify('Return & refund request submitted.');
                              }}
                              className="px-3 py-1.5 rounded border border-amber-500/40 text-amber-300"
                            >
                              Request Return
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Customer Bookings & Privacy/Consent Controls (Module 5, 15 & 23) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">My Service Appointments ({customerAppointments.length})</h2>
                  {customerAppointments.length === 0 ? (
                    <p className="text-[#8E8EA2]">No service appointments booked yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {customerAppointments.map((ap) => (
                        <div key={ap.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-3 flex justify-between">
                          <div>
                            <p className="font-semibold text-white">{ap.serviceName}</p>
                            <p className="text-[11px] text-[#9E9EB2]">
                              {ap.bookingDate} at {ap.timeSlot}
                            </p>
                          </div>
                          <span className="text-[#ECC86A] capitalize">{ap.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-white">Privacy, Marketing Consent & Data Export</h2>
                  <p className="text-[11px] text-[#9E9EB2]">
                    Control marketing communications and download your personal account data at any time.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/customer/consent', {
                          method: 'PATCH',
                          body: JSON.stringify({
                            marketingConsent: !profile.marketingConsent,
                            unsubscribed: Boolean(profile.marketingConsent),
                          }),
                        });
                        await refreshProfile();
                        onNotify('Marketing consent preference updated.');
                      }}
                      className="px-3.5 py-2 rounded border border-[#2A2A3A] text-white hover:border-[#D4AF37]"
                    >
                      {profile.marketingConsent ? 'Unsubscribe Marketing Offers' : 'Opt-In to Offers'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const data = await apiFetch<Record<string, unknown>>('/api/customer/privacy-export');
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `vijay-visuals-account-data.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          onNotify('Exported your personal data JSON.');
                        } catch (err) {
                          onNotify(err instanceof Error ? err.message : 'Unable to export data.');
                        }
                      }}
                      className="px-3.5 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
                    >
                      Download My Data (JSON)
                    </button>
                  </div>
                </div>
              </div>

              {/* Customer Domain Management Section (Integrated directly into Customer Dashboard) */}
              <div className="space-y-3 pt-2 border-t border-[#1E1E2B]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#D4AF37]">Customer Website Domain Management · 100% Customer Owned</p>
                    <h2 className="font-luxury text-lg font-bold text-white">My Website Domains, DNS, SSL & Renewals</h2>
                  </div>
                  {ownedTenants.length > 1 && (
                    <select
                      value={customerDomainTenantId ?? ownedTenants[0]?.id ?? ''}
                      onChange={(e) => setCustomerDomainTenantId(Number(e.target.value))}
                      className="rounded-md border border-[#2A2A3A] bg-[#0D0D13] px-3 py-2 text-xs text-white"
                    >
                      {ownedTenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (/site/{t.slug})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {ownedTenants.length > 0 ? (
                  <DomainManagementCenter
                    tenant={
                      ownedTenants.find((t) => t.id === customerDomainTenantId) || ownedTenants[0]
                    }
                    initialLang={lang}
                    onNotify={onNotify}
                    onRefreshTenant={onRefreshTenants}
                  />
                ) : (
                  <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-6 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 max-w-xl">
                      <p className="text-sm font-semibold text-white">Connect Your Own Business Domain (.com / .in / .co.in)</p>
                      <p className="text-[#9E9EB2]">
                        Create your website in the Website Builder first to generate DNS TXT/CNAME verification records, monitor SSL/HTTPS health, and receive 30/15/7/3/0-day renewal alerts—always keeping 100% domain ownership in your own registrar account.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onGoBuilder()}
                      className="px-4 py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold shrink-0"
                    >
                      Launch Website Builder
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= SUPER ADMIN CONSOLE (MODULE 6 & 11) ================= */}
          {roleTab === 'super_admin' && profile.role === 'super_admin' && !adminData && (
            <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-8 text-xs text-[#8E8EA2]">
              Loading Super Admin metrics...
            </div>
          )}
          {roleTab === 'super_admin' && profile.role === 'super_admin' && adminData && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-[#D4AF37]">Module 6 & 11 · Global Platform Governance</p>
                <h1 className="font-luxury text-2xl font-bold text-white">Super Admin Console</h1>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: 'Published Sites', val: `${adminData.stats.publishedTenantsCount ?? adminData.stats.tenantCount}/${adminData.stats.tenantCount}` },
                  { label: 'Users', val: adminData.stats.userCount },
                  { label: 'Orders', val: adminData.stats.orderCount },
                  { label: 'Platform GMV', val: `₹${adminData.stats.gmv.toLocaleString('en-IN')}` },
                  { label: 'Domains', val: `${adminData.stats.verifiedDomainsCount ?? 0}/${adminData.stats.domainsCount ?? 0}` },
                  { label: 'Proposals', val: adminData.stats.proposalsCount ?? 0 },
                  { label: 'Licensed PWAs', val: adminData.stats.pwaEnabledCount },
                  { label: 'AI Credits Used', val: adminData.stats.totalAiUsed },
                ].map((k) => (
                  <div key={k.label} className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
                    <p className="text-[11px] text-[#8E8EA2]">{k.label}</p>
                    <p className="font-mono-tabular text-base font-bold text-white mt-1">{k.val}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 border-b border-[#1E1E2B] pb-3">
                {[
                  { id: 'tenants', label: 'Businesses & PWA Licenses' },
                  { id: 'deliveries', label: 'Website Deliveries & Provisioning' },
                  { id: 'domains', label: `Domain Management (${adminData.stats.domainsCount ?? 0})` },
                  { id: 'proposals', label: `Proposals & Quotations (${adminData.proposals?.length ?? 0})` },
                  { id: 'ecosystem', label: 'Cashfree, Settlements & Announcements' },
                  { id: 'plans', label: 'Pricing & Packages' },
                  { id: 'users', label: 'Users & Roles' },
                  { id: 'tickets', label: 'Support Desk' },
                  { id: 'reviews_mod', label: 'Review Moderation Queue' },
                  { id: 'audits', label: 'Security Audit Logs' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdminSubTab(tab.id as typeof adminSubTab)}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-medium ${
                      adminSubTab === tab.id ? 'bg-[#D4AF37] text-[#08080A]' : 'bg-[#12121A] text-[#A3A3B5]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {adminSubTab === 'deliveries' && (
                <AdminDeliveriesPanel onNotify={onNotify} />
              )}

              {adminSubTab === 'domains' && (
                <AdminDomainManagement onNotify={onNotify} />
              )}

              {adminSubTab === 'proposals' && (
                <div className="space-y-6 text-xs">
                  <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white">Customer Proposals & Locked Quotations</h3>
                    {(adminData.proposals || []).length === 0 ? (
                      <p className="text-[#8E8EA2]">No customer proposals submitted yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {(adminData.proposals || []).map((p) => (
                          <div key={p.id} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-mono-tabular font-semibold text-[#ECC86A]">
                                {p.proposalNumber} · {p.businessName}
                              </p>
                              <p className="text-[11px] text-[#9A9AAE]">
                                {p.customerName} ({p.customerEmail}) · Total ₹{p.grandTotalInr.toLocaleString('en-IN')} (incl. ₹{p.gstInr.toLocaleString('en-IN')} GST)
                              </p>
                            </div>
                            <select
                              value={p.status}
                              onChange={async (e) => {
                                await apiFetch(`/api/proposals/${p.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: e.target.value }),
                                });
                                await loadSuperAdmin();
                                onNotify(`Updated proposal ${p.proposalNumber} to ${e.target.value}.`);
                              }}
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
                            >
                              <option value="sent">Sent</option>
                              <option value="accepted">Accepted (Locked)</option>
                              <option value="converted">Converted to Project</option>
                              <option value="expired">Expired</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white">Connected Custom Domains ({adminData.domains?.length ?? 0})</h3>
                    {(adminData.domains || []).length === 0 ? (
                      <p className="text-[#8E8EA2]">No custom domains added yet.</p>
                    ) : (
                      <div className="divide-y divide-[#1D1D28]">
                        {(adminData.domains || []).map((d) => (
                          <div key={d.id} className="py-2.5 flex items-center justify-between">
                            <div>
                              <p className="font-mono-tabular text-white font-semibold">{d.domainName}</p>
                              <p className="text-[11px] text-[#8E8EA2]">Tenant #{d.tenantId} {d.expiryDate ? `· Expires ${d.expiryDate}` : ''}</p>
                            </div>
                            <span className={`font-mono-tabular text-[11px] ${d.dnsStatus === 'verified' ? 'text-emerald-300' : 'text-amber-300'}`}>
                              DNS: {d.dnsStatus.toUpperCase()} · SSL: {d.sslStatus.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {adminSubTab === 'tenants' && (
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
                      <tr>
                        <th className="py-2.5 px-4">Business</th>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4">Optional PWA</th>
                        <th className="py-2.5 px-4">AI Credits</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1D1D28]">
                      {adminData.tenants.map((t) => (
                        <tr key={t.id}>
                          <td className="py-3 px-4">
                            <p className="text-white font-semibold">{t.name}</p>
                            <p className="font-mono-tabular text-[11px] text-[#8E8EA2]">/site/{t.slug}</p>
                          </td>
                          <td className="py-3 px-4 capitalize text-[#A5A5B8]">{t.category.replace('_', ' ')}</td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/tenants/${t.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    pwaEnabled: !t.pwaEnabled,
                                    planTier: !t.pwaEnabled ? 'website_pwa' : 'website_only',
                                  }),
                                });
                                await loadSuperAdmin();
                                onRefreshTenants();
                                onNotify(`Updated PWA license for ${t.name}.`);
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                                t.pwaEnabled ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' : 'border border-[#2A2A38] text-[#9A9AAE]'
                              }`}
                            >
                              {t.pwaEnabled ? 'PWA Licensed' : 'Website Only'}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono-tabular">
                            {t.aiCreditsUsed} / {t.aiCreditsLimit}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/tenants/${t.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ aiCreditsLimit: t.aiCreditsLimit + 500 }),
                                });
                                await loadSuperAdmin();
                                onNotify(`Added +500 AI credits to ${t.name}.`);
                              }}
                              className="text-[#ECC86A] hover:underline"
                            >
                              +500 AI
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenStorefront(t.slug)}
                              className="text-white hover:underline"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adminSubTab === 'plans' && (
                <div className="space-y-3">
                  {adminData.plans.map((plan) => (
                    <div key={plan.id} className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="max-w-lg">
                        <p className="text-white font-semibold">{plan.name}</p>
                        <p className="text-[#8E8EA2] mt-0.5">
                          {plan.category} · {plan.billingCycle} · {plan.includesPwa ? 'Includes Optional PWA' : 'No PWA'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#8E8EA2]">₹</span>
                        <input
                          type="number"
                          value={planPriceDrafts[plan.id] ?? plan.priceInr}
                          onChange={(e) =>
                            setPlanPriceDrafts((prev) => ({ ...prev, [plan.id]: Number(e.target.value) }))
                          }
                          className="w-28 rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 font-mono-tabular text-white"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/plans/${plan.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ priceInr: planPriceDrafts[plan.id] ?? plan.priceInr }),
                            });
                            await loadSuperAdmin();
                            onRefreshTenants();
                            onNotify(`Updated pricing for ${plan.name}.`);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminSubTab === 'users' && (
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
                      <tr>
                        <th className="py-2.5 px-4">User</th>
                        <th className="py-2.5 px-4">Email</th>
                        <th className="py-2.5 px-4">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1D1D28]">
                      {adminData.users.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 px-4 text-white">{u.name || 'Member'}</td>
                          <td className="py-3 px-4 text-[#9E9EB2]">{u.email}</td>
                          <td className="py-3 px-4">
                            <select
                              value={u.role}
                              onChange={async (e) => {
                                await apiFetch(`/api/admin/users/${u.id}/role`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ role: e.target.value }),
                                });
                                await loadSuperAdmin();
                                onNotify(`Updated role for ${u.email}.`);
                              }}
                              className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-xs text-white"
                            >
                              {['super_admin', 'business_owner', 'staff', 'delivery_partner', 'customer'].map((r) => (
                                <option key={r} value={r}>
                                  {r.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adminSubTab === 'tickets' && (
                <div className="space-y-3">
                  {adminData.tickets.map((t) => (
                    <div key={t.id} className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-4 flex flex-wrap justify-between gap-4 text-xs">
                      <div className="max-w-xl">
                        <p className="text-white font-semibold">{t.subject}</p>
                        <p className="text-[#8E8EA2]">
                          {t.customerName} ({t.customerEmail}) · {t.category.replace('_', ' ')}
                        </p>
                        <p className="text-[#C4C4D4] mt-1.5">{t.message}</p>
                      </div>
                      <select
                        value={t.status}
                        onChange={async (e) => {
                          await apiFetch(`/api/admin/tickets/${t.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: e.target.value }),
                          });
                          await loadSuperAdmin();
                          onNotify('Support ticket status updated.');
                        }}
                        className="h-9 rounded border border-[#2A2A38] bg-[#08080C] px-2.5 text-xs text-white"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {adminSubTab === 'audits' && (
                <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] divide-y divide-[#1D1D28] text-xs">
                  {adminData.audits.map((a) => (
                    <div key={a.id} className="p-3.5 flex flex-wrap justify-between gap-2">
                      <div>
                        <span className="font-mono-tabular text-[#ECC86A] font-semibold">{a.action}</span>
                        <span className="mx-2 text-[#525264]">·</span>
                        <span className="text-white">{a.details}</span>
                      </div>
                      <span className="text-[#8E8EA2]">
                        {a.actorEmail} · {new Date(a.createdAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {adminSubTab === 'reviews_mod' && <AdminReviewsModeration onNotify={onNotify} />}

              {adminSubTab === 'ecosystem' && <AdminEcosystemPanel onNotify={onNotify} />}
            </div>
          )}
        </main>
      </div>

      {/* Platform Tax Invoice Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-xl border border-[#2B2B3E] bg-[#0E0E15] p-6 text-xs text-[#E4E4EE] shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedReceipt(null)}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-1.5 rounded-md text-[#8E8EA2] hover:text-white hover:bg-[#1A1A26] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Invoice Header */}
            <div className="border-b border-[#242436] pb-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <VijayVisualsLogo variant="icon" size="md" mode="dark" />
                  <div>
                    <h2 className="font-luxury text-lg font-bold text-white tracking-wider">VIJAY VISUALS</h2>
                    <p className="text-[10px] text-[#A0A0B4] mt-0.5">Platform Web Engineering &amp; Multi-Tenant Cloud Services</p>
                    <p className="text-[10px] text-[#7E7E92]">Tax Invoice · SAC Code: 998314 (GSTIN: Pending Registration / Business Settings)</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 mb-1">
                    PAID / TAX INVOICE
                  </span>
                  <p className="font-mono-tabular text-[11px] text-[#ECC86A] font-semibold">
                    {getReceiptNumber(selectedReceipt)}
                  </p>
                  <p className="text-[10px] text-[#8E8EA2]">
                    Date:{' '}
                    {(() => {
                      const d = getPaymentDate(selectedReceipt);
                      if (!d) return 'Date Unavailable';
                      const dateObj = new Date(d);
                      return isNaN(dateObj.getTime()) ? 'Date Unavailable' : dateObj.toLocaleDateString('en-IN');
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Billed To */}
            <div className="rounded-lg border border-[#1E1E2C] bg-[#09090E] p-3 mb-4 text-[11px] space-y-1">
              <span className="text-[10px] text-[#8E8EA0] uppercase tracking-wider block">Customer Details</span>
              <p className="text-white font-medium">{profile?.name || 'Customer'}</p>
              <p className="text-[#A2A2B6]">{profile?.email}</p>
              {profile?.phone && <p className="text-[#A2A2B6]">Mobile: {profile.phone}</p>}
            </div>

            {/* Items Table */}
            <div className="rounded-lg border border-[#20202F] overflow-hidden mb-4">
              <div className="grid grid-cols-12 bg-[#12121A] px-3 py-2 text-[10px] text-[#8E8EA0] font-semibold uppercase tracking-wider">
                <span className="col-span-8">Description</span>
                <span className="col-span-4 text-right">Amount (INR)</span>
              </div>
              <div className="p-3 space-y-2 text-[11px]">
                {(() => {
                  const base = getBaseAmount(selectedReceipt);
                  const gst = getGstAmount(selectedReceipt);
                  const total = getGrandTotal(selectedReceipt);

                  if (base === null && total === null) {
                    return (
                      <div className="p-4 text-center text-amber-400 text-xs border border-amber-500/20 rounded bg-amber-950/20">
                        Payment breakdown details are unavailable for this receipt.
                      </div>
                    );
                  }

                  const taxableBase = base !== null ? base : (total !== null ? Math.round(total / 1.18) : 0);
                  const calculatedGst = gst !== null ? gst : (total !== null ? total - taxableBase : 0);
                  const finalTotal = total !== null ? total : (taxableBase + calculatedGst);
                  const cgst = Math.round(calculatedGst / 2);
                  const sgst = calculatedGst - cgst;
                  const planName = getPlanName(selectedReceipt);

                  return (
                    <>
                      <div className="grid grid-cols-12">
                        <div className="col-span-8">
                          <p className="text-white font-medium">{planName}</p>
                          <p className="text-[10px] text-[#7E7E92]">Website Management &amp; Storefront Access (SAC: 998314)</p>
                        </div>
                        <span className="col-span-4 text-right font-mono-tabular text-white">
                          ₹{taxableBase.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="border-t border-[#1C1C28] pt-2 space-y-1 text-[10px] text-[#9A9AB0] font-mono-tabular">
                        <div className="flex justify-between">
                          <span>Taxable Base Subtotal:</span>
                          <span>₹{taxableBase.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>CGST (9.0%):</span>
                          <span>₹{cgst.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SGST (9.0%):</span>
                          <span>₹{sgst.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-white pt-1.5 border-t border-[#1C1C28]">
                          <span>Grand Total (Settled):</span>
                          <span className="text-[#ECC86A]">
                            ₹{finalTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Verification Metadata */}
            <div className="rounded-lg border border-[#1C1C28] bg-[#09090E] p-2.5 mb-4 text-[10px] text-[#7E7E92] font-mono-tabular space-y-0.5">
              <p>Payment Gateway: Cashfree Payments (Server-Side Verified HMAC-SHA256)</p>
              {getPaymentId(selectedReceipt) && (
                <p>Payment ID: {getPaymentId(selectedReceipt)}</p>
              )}
              <p>Status: {selectedReceipt.status ? String(selectedReceipt.status).toUpperCase() : 'COMPLETED'} &amp; Entitlement Granted</p>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-bold hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save Tax Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-2.5 rounded-md border border-[#2B2B3C] text-xs text-[#8E8EA2] hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {selectedTenantId && (
        <OwnerCategoryModal
          tenantId={selectedTenantId}
          isOpen={categoryModalOpen}
          onClose={() => setCategoryModalOpen(false)}
          onNotify={onNotify}
          onCategoriesChanged={() => {
            if (selectedTenantId) loadOwnerOverview(selectedTenantId);
          }}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrderDetail && (
        <OwnerOrderDetailModal
          order={selectedOrderDetail}
          deliveryPartners={ownerData?.deliveryPartners || []}
          isOpen={Boolean(selectedOrderDetail)}
          onClose={() => setSelectedOrderDetail(null)}
          onOrderUpdated={async () => {
            if (selectedTenantId) await loadOwnerOverview(selectedTenantId);
            setSelectedOrderDetail(null);
          }}
          onOpenInvoice={onOpenInvoice}
          businessName={ownerData?.tenant.name || 'Store'}
          onNotify={onNotify}
        />
      )}

      {/* Customer Profile Modal */}
      {selectedCustomerProfile && (
        <OwnerCustomerProfileModal
          customer={selectedCustomerProfile}
          orders={ownerData?.orders || []}
          isOpen={Boolean(selectedCustomerProfile)}
          onClose={() => setSelectedCustomerProfile(null)}
          onOpenOrder={(ord) => setSelectedOrderDetail(ord)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
};
