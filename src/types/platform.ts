export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: 'super_admin' | 'business_owner' | 'staff' | 'delivery_partner' | 'customer';
  preferredLang: string;
  savedAddressesJson: string;
  marketingConsent?: boolean;
  unsubscribed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GalleryItem {
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface TenantModules {
  ecommerce: boolean;
  cartCheckout: boolean;
  gallery: boolean;
  bookings: boolean;
  whatsappOrder: boolean;
  reviews: boolean;
  wishlist: boolean;
  coupons: boolean;
  wholesale: boolean;
}

export interface TenantRecord {
  id: number;
  websiteId?: string;
  ownerUserId: number | null;
  name: string;
  slug: string;
  category: string;
  templateId: string;
  templateName?: string;
  templateFeatures?: string[];
  tagline: string;
  description: string;
  logoText: string;
  logoImage?: string;
  bannerImage: string;
  galleryImages?: string[];
  galleryItems?: GalleryItem[];
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  customDomain: string;
  seoTitle?: string;
  seoDescription?: string;
  currency?: string;
  language?: string;
  timezone?: string;
  phone: string;
  whatsapp: string;
  address: string;
  businessHours?: string;
  deliveryInfo?: string;
  returnPolicy?: string;
  enabledModules?: TenantModules;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    youtube?: string;
    website?: string;
  };
  sectionOrder?: string[];
  customPages?: Array<{ slug: string; title: string; content: string }>;
  published: boolean;
  status?: string;
  planTier: 'website_only' | 'website_pwa' | 'enterprise_ai';
  pwaEnabled: boolean;
  pwaAppName: string;
  pwaShortName: string;
  pwaThemeColor: string;
  pwaLicenseKey: string;
  aiCreditsLimit: number;
  aiCreditsUsed: number;
  deliveryFee: number;
  deliveryCommissionPct: number;
  codEnabled: boolean;
  upiId: string;
  cashfreeOnlineReady?: boolean;
  razorpayOnlineReady?: boolean;
  googleReviewUrl?: string;
  googlePlaceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductRecord {
  id: number;
  tenantId: number;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  stock: number;
  lowStockThreshold: number;
  imageUrl: string;
  images?: string[];
  videoUrl: string;
  variantsJson: string;
  specs?: string;
  sku?: string;
  barcode?: string;
  featured?: boolean;
  bestseller?: boolean;
  rating: string;
  reviewCount: number;
  active: boolean;
}

export interface CouponRecord {
  id: number;
  tenantId: number;
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  minOrder: number;
  active: boolean;
}

export interface ReviewPhoto {
  id: number;
  photoUrl: string;
  caption: string;
}

export interface ReviewRecord {
  id: number;
  tenantId: number;
  websiteId?: string;
  productId: number;
  productName?: string;
  orderId?: number | null;
  reviewerUserId?: string;
  customerName: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase?: boolean;
  ownerReply?: string;
  ownerRepliedAt?: string;
  moderationStatus?: 'published' | 'flagged' | 'hidden' | 'removed';
  reportedCount?: number;
  lastReportReason?: string;
  photos?: ReviewPhoto[];
  createdAt: string;
  updatedAt?: string;
}

export interface RatingDistributionItem {
  stars: number;
  count: number;
  percentage: number;
}

export interface MonthlyRatingTrend {
  month: string;
  count: number;
  avgRating: number;
}

export interface ProductRatingComparison {
  productId: number;
  productName: string;
  reviewCount: number;
  avgRating: number;
}

export interface ReviewAnalytics {
  totalReviews: number;
  averageRating: number;
  verifiedPurchaseCount: number;
  verifiedPurchasePercentage: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  monthlyTrends: MonthlyRatingTrend[];
  productComparisons: ProductRatingComparison[];
}

export interface ReviewSummary {
  totalReviews: number;
  averageRating: number;
  verifiedPurchaseCount: number;
  verifiedPurchasePercentage: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface OrderItemLine {
  productId: number;
  name: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: number;
  orderNumber: string;
  tenantId: number;
  customerUserId: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  itemsJson: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponCode: string;
  paymentMethod: string;
  paymentReference: string;
  paymentStatus: string;
  status: string;
  deliveryPartnerId: number | null;
  deliveryCommission: number;
  invoiceNumber: string;
  isWholesale: boolean;
  notes: string;
  createdAt: string;
}

export interface DeliveryPartnerRecord {
  id: number;
  tenantId: number;
  userId: number | null;
  name: string;
  phone: string;
  vehicleType: string;
  available: boolean;
  totalDeliveries: number;
  totalEarnings: number;
}

export interface StaffMemberRecord {
  id: number;
  tenantId: number;
  name: string;
  email: string;
  staffRole: string;
  active: boolean;
}

export interface AutomationWorkflowRecord {
  id: number;
  tenantId: number;
  name: string;
  triggerType: string;
  conditionText: string;
  actionType: string;
  requiresApproval: boolean;
  scheduleCron: string;
  enabled: boolean;
  lastRunAt: string | null;
}

export interface AutomationLogRecord {
  id: number;
  tenantId: number;
  workflowId: number | null;
  eventType: string;
  status: string;
  summary: string;
  creditsUsed: number;
  createdAt: string;
}

export interface PlatformPlanRecord {
  id: number;
  code: string;
  name: string;
  category: string;
  priceInr: number;
  billingCycle: string;
  includesPwa: boolean;
  aiCreditsIncluded: number;
  storageGb: number;
  featuresJson: string;
  thirdPartyDisclosure: string;
  active: boolean;
}

export interface SupportTicketRecord {
  id: number;
  tenantId: number | null;
  userId: number | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorEmail: string;
  actorRole: string;
  tenantId: number | null;
  action: string;
  details: string;
  createdAt: string;
}

export interface CashfreePaymentRecord {
  id: number;
  userId: number | null;
  tenantId: number | null;
  planCode: string;
  planName: string;
  amountInr: number;
  currency: string;
  mode: string;
  cfOrderId: string;
  cfPaymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  signatureVerified: boolean;
  status: string;
  licenseActivated: boolean;
  receiptNumber: string;
  refundId: string;
  notes: string;
  createdAt: string;
}

export interface CashfreeSellerSettlementRecord {
  id: number;
  websiteId: string;
  orderId: number | null;
  cfOrderId: string;
  cfPaymentId: string;
  settlementId?: string;
  grossAmountInr: number;
  platformFeeInr: number;
  sellerNetAmountInr: number;
  settlementStatus: string;
  createdAt: string;
}

export interface PlatformPaymentRecord {
  id: number;
  userId: number | null;
  tenantId: number | null;
  planCode: string;
  planName: string;
  amountInr: number;
  currency: string;
  mode: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signatureVerified: boolean;
  status: string;
  licenseActivated: boolean;
  receiptNumber: string;
  refundId: string;
  notes: string;
  createdAt: string;
}

export interface SellerPayoutAccountRecord {
  id: number;
  tenantId: number;
  legalBusinessName: string;
  panNumber: string;
  gstin: string;
  bankAccountHolder: string;
  bankAccountLast4: string;
  ifscCode: string;
  razorpayAccountId: string;
  kycStatus: 'not_submitted' | 'pending_review' | 'verified' | 'rejected';
  platformCommissionPct: number;
  settlementHoldDays: number;
  routeEnabled: boolean;
  updatedAt?: string;
}

export interface SellerTransferRecord {
  id: number;
  tenantId: number;
  orderId: number | null;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayTransferId: string;
  grossAmountInr: number;
  platformCommissionInr: number;
  sellerNetAmountInr: number;
  status: string;
  reversalId: string;
  createdAt: string;
}

export interface AppointmentRecord {
  id: number;
  tenantId: number;
  customerUserId: number | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  staffAssigned: string;
  bookingDate: string;
  timeSlot: string;
  advanceAmountInr: number;
  status: string;
  notes: string;
  createdAt: string;
}

export interface CrmLeadRecord {
  id: number;
  tenantId: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  stage: string;
  loyaltyPoints: number;
  marketingConsent: boolean;
  unsubscribed: boolean;
  nextFollowupDate: string;
  notes: string;
  createdAt: string;
}

export interface FinanceRecordItem {
  id: number;
  tenantId: number;
  recordType: 'expense' | 'quotation' | 'credit_note';
  referenceNo: string;
  partyName: string;
  category: string;
  amountInr: number;
  gstRatePct: number;
  gstAmountInr: number;
  status: string;
  notes: string;
  createdAt: string;
}

export interface WarehouseRecord {
  id: number;
  tenantId: number;
  name: string;
  city: string;
  capacityUnits: number;
  managerName: string;
  active: boolean;
}

export interface SupplierRecord {
  id: number;
  tenantId: number;
  name: string;
  contactPhone: string;
  gstin: string;
  category: string;
  leadTimeDays: number;
  notes: string;
}

export interface StaffAttendanceRecord {
  id: number;
  tenantId: number;
  staffId: number;
  recordDate: string;
  status: string;
  salaryPaidInr: number;
  notes: string;
}

export interface TenantPluginRecord {
  id: number;
  tenantId: number;
  pluginCode: string;
  pluginName: string;
  permissionScope: string;
  configJson: string;
  enabled: boolean;
  installedAt: string;
}

export interface PlatformAnnouncementRecord {
  id: number;
  title: string;
  message: string;
  severity: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AiSetupDraft {
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  primaryColor: string;
  accentColor: string;
  logoText: string;
  categories: string[];
  starterProducts: Array<{
    name: string;
    category: string;
    price: number;
    description: string;
  }>;
  faqs: Array<{ q: string; a: string }>;
}

export interface BusinessLocationRecord {
  id: number;
  tenantId: number;
  branchName: string;
  isPrimary: boolean;
  fullAddress: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  phone: string;
  openingHours: string;
  locationSource: 'map_pin' | 'gps_consent' | 'geocoded' | 'manual' | string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLocationPingRecord {
  id: number;
  orderId: number;
  tenantId: number;
  deliveryPartnerId: number | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  batterySaverMode: boolean;
  consentGranted: boolean;
  recordedAt: string;
}

export interface CartItem {
  product: ProductRecord;
  quantity: number;
  variant: string;
}

export type AppView = 'studio' | 'builder' | 'marketplace' | 'storefront' | 'dashboards' | 'ai' | 'demo';
