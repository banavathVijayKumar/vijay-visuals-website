import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  role: text('role').notNull().default('customer'), // super_admin | business_owner | staff | delivery_partner | customer
  preferredLang: text('preferred_lang').notNull().default('en'), // en | te | hi
  savedAddressesJson: text('saved_addresses_json').notNull().default('[]'),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').notNull(), // 16 global business categories
  templateId: text('template_id').notNull().default('obsidian-luxury'),
  tagline: text('tagline').notNull().default(''),
  description: text('description').notNull().default(''),
  logoText: text('logo_text').notNull().default('VV'),
  bannerImage: text('banner_image').notNull().default(''),
  primaryColor: text('primary_color').notNull().default('#D4AF37'),
  accentColor: text('accent_color').notNull().default('#0D0D12'),
  fontFamily: text('font_family').notNull().default('Cinzel'),
  customDomain: text('custom_domain').notNull().default(''),
  seoTitle: text('seo_title').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  currency: text('currency').notNull().default('INR'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  phone: text('phone').notNull().default('+91 93813 62201'),
  whatsapp: text('whatsapp').notNull().default('919381362201'),
  address: text('address').notNull().default('Hyderabad, Telangana'),
  published: boolean('published').notNull().default(true),
  planTier: text('plan_tier').notNull().default('website_only'), // website_only | website_pwa | enterprise_ai
  pwaEnabled: boolean('pwa_enabled').notNull().default(false),
  pwaAppName: text('pwa_app_name').notNull().default(''),
  pwaShortName: text('pwa_short_name').notNull().default(''),
  pwaThemeColor: text('pwa_theme_color').notNull().default('#08080A'),
  pwaLicenseKey: text('pwa_license_key').notNull().default(''),
  aiCreditsLimit: integer('ai_credits_limit').notNull().default(500),
  aiCreditsUsed: integer('ai_credits_used').notNull().default(0),
  deliveryFee: integer('delivery_fee').notNull().default(49),
  deliveryCommissionPct: integer('delivery_commission_pct').notNull().default(15),
  codEnabled: boolean('cod_enabled').notNull().default(true),
  upiId: text('upi_id').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull().default('General'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  compareAtPrice: integer('compare_at_price').notNull().default(0),
  wholesalePrice: integer('wholesale_price').notNull().default(0),
  minWholesaleQty: integer('min_wholesale_qty').notNull().default(10),
  stock: integer('stock').notNull().default(20),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  imageUrl: text('image_url').notNull().default(''),
  videoUrl: text('video_url').notNull().default(''),
  variantsJson: text('variants_json').notNull().default('[]'),
  rating: text('rating').notNull().default('4.8'),
  reviewCount: integer('review_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  code: text('code').notNull(),
  discountType: text('discount_type').notNull().default('percent'), // percent | flat
  discountValue: integer('discount_value').notNull(),
  minOrder: integer('min_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deliveryPartners = pgTable('delivery_partners', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  vehicleType: text('vehicle_type').notNull().default('Two-Wheeler'),
  available: boolean('available').notNull().default(true),
  totalDeliveries: integer('total_deliveries').notNull().default(0),
  totalEarnings: integer('total_earnings').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  customerUserId: integer('customer_user_id').references(() => users.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email').notNull().default(''),
  shippingAddress: text('shipping_address').notNull(),
  itemsJson: text('items_json').notNull().default('[]'),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  deliveryFee: integer('delivery_fee').notNull().default(0),
  total: integer('total').notNull(),
  couponCode: text('coupon_code').notNull().default(''),
  paymentMethod: text('payment_method').notNull().default('cod'), // cod | upi_reference | razorpay_route
  paymentReference: text('payment_reference').notNull().default(''),
  paymentStatus: text('payment_status').notNull().default('cod_due'), // cod_due | pending_verification | paid | refunded
  status: text('status').notNull().default('confirmed'), // confirmed | preparing | ready_for_pickup | out_for_delivery | delivered | cancelled | return_requested
  deliveryPartnerId: integer('delivery_partner_id').references(() => deliveryPartners.id),
  deliveryCommission: integer('delivery_commission').notNull().default(0),
  invoiceNumber: text('invoice_number').notNull(),
  isWholesale: boolean('is_wholesale').notNull().default(false),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  customerName: text('customer_name').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const staffMembers = pgTable('staff_members', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  staffRole: text('staff_role').notNull().default('store_manager'), // store_manager | inventory_clerk | support_agent
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const automationWorkflows = pgTable('automation_workflows', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  conditionText: text('condition_text').notNull().default('Always run'),
  actionType: text('action_type').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  scheduleCron: text('schedule_cron').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const automationLogs = pgTable('automation_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  workflowId: integer('workflow_id'),
  eventType: text('event_type').notNull(),
  status: text('status').notNull().default('executed'),
  summary: text('summary').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  creditsUsed: integer('credits_used').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull().default(''),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  category: text('category').notNull().default('order_issue'),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const platformPlans = pgTable('platform_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  priceInr: integer('price_inr').notNull(),
  billingCycle: text('billing_cycle').notNull().default('one_time'),
  includesPwa: boolean('includes_pwa').notNull().default(false),
  aiCreditsIncluded: integer('ai_credits_included').notNull().default(250),
  storageGb: integer('storage_gb').notNull().default(5),
  featuresJson: text('features_json').notNull().default('[]'),
  thirdPartyDisclosure: text('third_party_disclosure').notNull().default(''),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').notNull(),
  tenantId: integer('tenant_id'),
  action: text('action').notNull(),
  details: text('details').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =====================================================================
// PHASE 2 GLOBAL AI BUSINESS ECOSYSTEM TABLES (MODULES 3, 5, 7, 11-15, 21)
// =====================================================================

// Module 3A & 17: Vijay Visuals Platform Merchant Payments (Own Razorpay Account)
export const platformPayments = pgTable('platform_payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  planCode: text('plan_code').notNull(),
  planName: text('plan_name').notNull(),
  amountInr: integer('amount_inr').notNull(),
  currency: text('currency').notNull().default('INR'),
  mode: text('mode').notNull().default('test'), // test | live
  razorpayOrderId: text('razorpay_order_id').notNull().unique(),
  razorpayPaymentId: text('razorpay_payment_id').notNull().default(''),
  signatureVerified: boolean('signature_verified').notNull().default(false),
  status: text('status').notNull().default('created'), // created | captured | failed | refunded
  licenseActivated: boolean('license_activated').notNull().default(false),
  receiptNumber: text('receipt_number').notNull(),
  refundId: text('refund_id').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Module 3B: Business Owner Razorpay Route Linked Account & KYC Onboarding
export const sellerPayoutAccounts = pgTable('seller_payout_accounts', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  legalBusinessName: text('legal_business_name').notNull(),
  panNumber: text('pan_number').notNull().default(''),
  gstin: text('gstin').notNull().default(''),
  bankAccountHolder: text('bank_account_holder').notNull().default(''),
  bankAccountLast4: text('bank_account_last4').notNull().default(''),
  ifscCode: text('ifsc_code').notNull().default(''),
  razorpayAccountId: text('razorpay_account_id').notNull().default(''), // acc_xxx once approved by Razorpay Route
  kycStatus: text('kyc_status').notNull().default('not_submitted'), // not_submitted | pending_review | verified | rejected
  platformCommissionPct: integer('platform_commission_pct').notNull().default(5),
  settlementHoldDays: integer('settlement_hold_days').notNull().default(2),
  routeEnabled: boolean('route_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 3B: Marketplace Seller Route Transfers & Settlement Reconciliation
export const sellerTransfers = pgTable('seller_transfers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  razorpayOrderId: text('razorpay_order_id').notNull().default(''),
  razorpayPaymentId: text('razorpay_payment_id').notNull().default(''),
  razorpayTransferId: text('razorpay_transfer_id').notNull().default(''),
  grossAmountInr: integer('gross_amount_inr').notNull(),
  platformCommissionInr: integer('platform_commission_inr').notNull().default(0),
  sellerNetAmountInr: integer('seller_net_amount_inr').notNull(),
  status: text('status').notNull().default('pending'), // pending | routed | settled | reversed | failed
  reversalId: text('reversal_id').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 3D: Raw Webhook Signature & Idempotency Guard
export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull().default('razorpay'),
  eventId: text('event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  signatureVerified: boolean('signature_verified').notNull().default(false),
  payloadSummary: text('payload_summary').notNull().default(''),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

// Module 2 & 5: Cross-Device Database Wishlist
export const wishlists = pgTable('wishlists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 15: Appointments & Service Bookings (Salons, Studios, Hotels, Consultants)
export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  customerUserId: integer('customer_user_id').references(() => users.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email').notNull().default(''),
  serviceName: text('service_name').notNull(),
  staffAssigned: text('staff_assigned').notNull().default('Any Available'),
  bookingDate: text('booking_date').notNull(), // YYYY-MM-DD
  timeSlot: text('time_slot').notNull(), // e.g. 11:00 AM
  advanceAmountInr: integer('advance_amount_inr').notNull().default(0),
  status: text('status').notNull().default('confirmed'), // confirmed | rescheduled | completed | cancelled
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 11: CRM, Leads, Loyalty & Consent Management
export const crmLeads = pgTable('crm_leads', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull().default(''),
  source: text('source').notNull().default('website'), // website | whatsapp | walk_in | referral
  stage: text('stage').notNull().default('new'), // new | contacted | qualified | won | lost
  loyaltyPoints: integer('loyalty_points').notNull().default(0),
  marketingConsent: boolean('marketing_consent').notNull().default(true),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  nextFollowupDate: text('next_followup_date').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 12: GST Finance, Expenses, Quotations & Credit Notes
export const financeRecords = pgTable('finance_records', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  recordType: text('record_type').notNull().default('expense'), // expense | quotation | credit_note
  referenceNo: text('reference_no').notNull(),
  partyName: text('party_name').notNull(),
  category: text('category').notNull().default('Operations'),
  amountInr: integer('amount_inr').notNull(),
  gstRatePct: integer('gst_rate_pct').notNull().default(18),
  gstAmountInr: integer('gst_amount_inr').notNull().default(0),
  status: text('status').notNull().default('recorded'), // recorded | sent | accepted | settled
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 13: Warehouses & Suppliers
export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  capacityUnits: integer('capacity_units').notNull().default(500),
  managerName: text('manager_name').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  gstin: text('gstin').notNull().default(''),
  category: text('category').notNull().default('General Supply'),
  leadTimeDays: integer('lead_time_days').notNull().default(3),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 14: Staff Attendance, Leaves & Salary Ledger
export const staffAttendance = pgTable('staff_attendance', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  staffId: integer('staff_id')
    .references(() => staffMembers.id, { onDelete: 'cascade' })
    .notNull(),
  recordDate: text('record_date').notNull(), // YYYY-MM-DD
  status: text('status').notNull().default('present'), // present | absent | leave | half_day
  salaryPaidInr: integer('salary_paid_inr').notNull().default(0),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 21: Extensible Declarative Plugin & Webhook Marketplace (No Untrusted Code Execution)
export const tenantPlugins = pgTable('tenant_plugins', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  pluginCode: text('plugin_code').notNull(), // google_analytics | shiprocket_webhook | whatsapp_cloud | tally_gst_export | custom_webhook
  pluginName: text('plugin_name').notNull(),
  permissionScope: text('permission_scope').notNull().default('read:orders'),
  configJson: text('config_json').notNull().default('{}'),
  enabled: boolean('enabled').notNull().default(true),
  installedAt: timestamp('installed_at').defaultNow().notNull(),
});

// Module 7: Super Admin Global Announcements
export const platformAnnouncements = pgTable('platform_announcements', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  severity: text('severity').notNull().default('info'), // info | update | maintenance
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').notNull().default('vk66278@gmail.com'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 3 & Stage 6: Complete Customer Domain Management, Verification, SSL, Health & Renewal Tracking
export const tenantDomains = pgTable('tenant_domains', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  domainName: text('domain_name').notNull().unique(),
  extension: text('extension').notNull().default('.in'),
  domainType: text('domain_type').notNull().default('root'), // root | subdomain
  isPrimary: boolean('is_primary').notNull().default(false),
  wwwPreference: text('www_preference').notNull().default('redirect_to_root'), // redirect_to_root | redirect_to_www | both
  wwwStatus: text('www_status').notNull().default('pending'), // pending | configured | mismatch | not_applicable
  ownershipMode: text('ownership_mode').notNull().default('customer_external'), // customer_external | registrar_api
  registrarName: text('registrar_name').notNull().default('External Registrar (Customer Owned)'),
  verificationToken: text('verification_token').notNull(),
  connectionStatus: text('connection_status').notNull().default('dns_pending'), // draft | dns_pending | ownership_verified | ssl_provisioning | live | error | suspended | disconnected
  workflowStep: integer('workflow_step').notNull().default(4), // 1..12
  approvalStatus: text('approval_status').notNull().default('auto'), // auto | pending_review | approved | rejected
  dnsStatus: text('dns_status').notNull().default('pending'), // pending | verified | dns_error
  sslStatus: text('ssl_status').notNull().default('pending'), // pending | provisioning | active | error
  sslIssuer: text('ssl_issuer').notNull().default(''),
  sslExpiresAt: text('ssl_expires_at').notNull().default(''),
  dnsErrorDetail: text('dns_error_detail').notNull().default(''),
  expiryDate: text('expiry_date').notNull().default(''), // YYYY-MM-DD
  renewalDate: text('renewal_date').notNull().default(''), // YYYY-MM-DD
  renewalReminderDate: text('renewal_reminder_date').notNull().default(''), // YYYY-MM-DD
  renewalStatus: text('renewal_status').notNull().default('active'), // active | expiring_soon | renewal_due | expired | renewed_confirmed
  renewalPaymentStatus: text('renewal_payment_status').notNull().default('not_due'), // not_due | pending_customer_consent | paid_external_registrar | overdue
  assignedSupportStaff: text('assigned_support_staff').notNull().default(''),
  lastHealthStatus: text('last_health_status').notNull().default('unchecked'), // unchecked | healthy | degraded | down
  suspendedReason: text('suspended_reason').notNull().default(''),
  ownershipVerifiedAt: timestamp('ownership_verified_at'),
  sslCheckedAt: timestamp('ssl_checked_at'),
  lastHealthCheckAt: timestamp('last_health_check_at'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Stage 6: Immutable Domain Connection History, Error Logs & Super Admin Audit Trail
export const domainEvents = pgTable('domain_events', {
  id: serial('id').primaryKey(),
  domainId: integer('domain_id')
    .references(() => tenantDomains.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  actorEmail: text('actor_email').notNull().default('system'),
  actorRole: text('actor_role').notNull().default('system'),
  eventType: text('event_type').notNull(), // domain_added | dns_check | ownership_verified | ssl_check | health_check | primary_changed | admin_action | renewal_reminder | error
  severity: text('severity').notNull().default('info'), // info | success | warning | error
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 6: Customer Domain Notifications & Automated 30/15/7/3/0-Day Expiry Reminders
export const domainNotifications = pgTable('domain_notifications', {
  id: serial('id').primaryKey(),
  domainId: integer('domain_id')
    .references(() => tenantDomains.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  notificationType: text('notification_type').notNull(), // domain_connected | dns_config_required | dns_verification_failed | ssl_pending | ssl_active | expiry_approaching | renewal_payment_pending | domain_expired | domain_connection_problem | domain_published
  milestoneKey: text('milestone_key').notNull().default(''), // e.g. expiry_30d, expiry_15d, expiry_7d, expiry_3d, expiry_0d
  title: text('title').notNull(),
  message: text('message').notNull(),
  channelStatusJson: text('channel_status_json').notNull().default('{"in_app":"delivered"}'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 6: Live Domain Health Monitoring Snapshots (DNS, SSL/TLS, HTTPS, WWW Redirect)
export const domainHealthChecks = pgTable('domain_health_checks', {
  id: serial('id').primaryKey(),
  domainId: integer('domain_id')
    .references(() => tenantDomains.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  dnsHealthy: boolean('dns_healthy').notNull().default(false),
  sslHealthy: boolean('ssl_healthy').notNull().default(false),
  httpsAvailable: boolean('https_available').notNull().default(false),
  httpStatusCode: integer('http_status_code').notNull().default(0),
  wwwRedirectHealthy: boolean('www_redirect_healthy').notNull().default(false),
  responseTimeMs: integer('response_time_ms').notNull().default(0),
  resolvedIpsJson: text('resolved_ips_json').notNull().default('[]'),
  resolvedCnamesJson: text('resolved_cnames_json').notNull().default('[]'),
  sslIssuer: text('ssl_issuer').notNull().default(''),
  sslValidTo: text('ssl_valid_to').notNull().default(''),
  errorSummary: text('error_summary').notNull().default(''),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
});

// Stage 6: Super Admin Configurable Domain & Hosting Fee Matrix (Transparent, No Auto-Charge)
export const domainPricingConfig = pgTable('domain_pricing_config', {
  id: serial('id').primaryKey(),
  extension: text('extension').notNull().unique(),
  registrationFeeInr: integer('registration_fee_inr').notNull().default(949),
  renewalFeeInr: integer('renewal_fee_inr').notNull().default(1099),
  transferFeeInr: integer('transfer_fee_inr').notNull().default(999),
  managementServiceFeeInr: integer('management_service_fee_inr').notNull().default(499),
  hostingFeeInr: integer('hosting_fee_inr').notNull().default(299),
  sslFeeInr: integer('ssl_fee_inr').notNull().default(0),
  websiteDevFeeInr: integer('website_dev_fee_inr').notNull().default(4999),
  gstPct: integer('gst_pct').notNull().default(18),
  isPromotional: boolean('is_promotional').notNull().default(true),
  promoNote: text('promo_note').notNull().default('First-year indicative registrar rate; renewal charged at standard rate.'),
  updatedBy: text('updated_by').notNull().default('system'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Stage 3 Module 2: Website Builder Draft Snapshots & Version Restore
export const tenantVersions = pgTable('tenant_versions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  versionNumber: integer('version_number').notNull().default(1),
  label: text('label').notNull().default('Saved Draft'),
  snapshotJson: text('snapshot_json').notNull().default('{}'),
  isPublished: boolean('is_published').notNull().default(false),
  createdBy: text('created_by').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 3 Module 5: Consent-Based Newsletter Subscriptions
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  source: text('source').notNull().default('website'),
  consentGiven: boolean('consent_given').notNull().default(true),
  unsubscribed: boolean('unsubscribed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 3 Modules 10 & 11: Server-Validated Locked Quotations & Proposals
export const proposals = pgTable('proposals', {
  id: serial('id').primaryKey(),
  proposalNumber: text('proposal_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  businessName: text('business_name').notNull(),
  businessCategory: text('business_category').notNull().default('clothing'),
  billingPeriod: text('billing_period').notNull().default('monthly'), // monthly | yearly
  itemsJson: text('items_json').notNull().default('[]'),
  oneTimeSubtotalInr: integer('one_time_subtotal_inr').notNull().default(0),
  recurringSubtotalInr: integer('recurring_subtotal_inr').notNull().default(0),
  discountInr: integer('discount_inr').notNull().default(0),
  gstInr: integer('gst_inr').notNull().default(0),
  grandTotalInr: integer('grand_total_inr').notNull().default(0),
  status: text('status').notNull().default('draft'), // draft | sent | accepted | converted | expired
  lockedAt: timestamp('locked_at'),
  acceptedAt: timestamp('accepted_at'),
  leadSource: text('lead_source').notNull().default('pricing_builder'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Stage 3 Modules 2 & 4: Tenant SEO Configuration, Local SEO & Custom Navigation Pages
export const tenantSeoSettings = pgTable('tenant_seo_settings', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  canonicalUrl: text('canonical_url').notNull().default(''),
  robotsDirectives: text('robots_directives').notNull().default('index, follow'),
  googleSiteVerification: text('google_site_verification').notNull().default(''),
  ga4MeasurementId: text('ga4_measurement_id').notNull().default(''),
  cityAreaKeywords: text('city_area_keywords').notNull().default(''),
  googleMapsUrl: text('google_maps_url').notNull().default(''),
  gbpProfileUrl: text('gbp_profile_url').notNull().default(''),
  localBusinessType: text('local_business_type').notNull().default('LocalBusiness'),
  sectionOrderJson: text('section_order_json').notNull().default('["hero","catalog","reviews","booking","contact"]'),
  customPagesJson: text('custom_pages_json').notNull().default('[{"slug":"about","title":"About Us","content":"Welcome to our official business storefront.","inNav":true},{"slug":"shipping-returns","title":"Shipping & Returns","content":"Transparent delivery timelines and customer-friendly return guidelines.","inNav":true}]'),
  lastAuditScore: integer('last_audit_score').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// =====================================================================
// STAGE 4: ALL-IN-ONE BUSINESS OPERATING SYSTEM TABLES
// =====================================================================

// Module 4: Supplier Purchase Orders & Cost Tracking
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  poNumber: text('po_number').notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierName: text('supplier_name').notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitCostInr: integer('unit_cost_inr').notNull(),
  totalCostInr: integer('total_cost_inr').notNull(),
  status: text('status').notNull().default('ordered'), // ordered | received | cancelled
  paymentStatus: text('payment_status').notNull().default('unpaid'), // unpaid | paid
  expectedDate: text('expected_date').notNull().default(''),
  receivedAt: timestamp('received_at'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 4: Stock Movements, Transfers, Expiry, Barcode/SKU & Damaged Stock
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  warehouseId: integer('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
  movementType: text('movement_type').notNull().default('adjustment'), // purchase_in | sale_out | transfer | damaged | adjustment
  quantityDelta: integer('quantity_delta').notNull(),
  unitCostInr: integer('unit_cost_inr').notNull().default(0),
  skuBarcode: text('sku_barcode').notNull().default(''),
  expiryDate: text('expiry_date').notNull().default(''),
  reason: text('reason').notNull().default(''),
  actorEmail: text('actor_email').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Module 7: Staff Work Assignments & Task Tracking
export const staffTasks = pgTable('staff_tasks', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  staffId: integer('staff_id').references(() => staffMembers.id, { onDelete: 'set null' }),
  staffName: text('staff_name').notNull().default('Unassigned'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
  dueDate: text('due_date').notNull().default(''),
  status: text('status').notNull().default('pending'), // pending | in_progress | completed
  assignedBy: text('assigned_by').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Module 1: Guided 12-Step Customer Onboarding Progress
export const onboardingProgress = pgTable('onboarding_progress', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  completedStepsJson: text('completed_steps_json').notNull().default('[]'),
  currentStep: integer('current_step').notNull().default(1),
  dismissed: boolean('dismissed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Module 17: Customer Feedback, CSAT Ratings & Feature Requests
export const platformFeedback = pgTable('platform_feedback', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  tenantId: integer('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  feedbackType: text('feedback_type').notNull().default('feedback'), // feedback | feature_request
  rating: integer('rating').notNull().default(5),
  title: text('title').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('received'), // received | reviewed | planned | completed
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tenants: many(tenants),
  orders: many(orders),
}));

// =====================================================================
// STAGE 5: GOOGLE MAPS MULTI-BRANCH LOCATIONS & DELIVERY TRACKING
// =====================================================================

// Multi-branch business locations with map pin, explicit GPS consent, or manual fallback
export const businessLocations = pgTable('business_locations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  branchName: text('branch_name').notNull().default('Main Branch'),
  isPrimary: boolean('is_primary').notNull().default(false),
  fullAddress: text('full_address').notNull(),
  city: text('city').notNull().default(''),
  state: text('state').notNull().default(''),
  postalCode: text('postal_code').notNull().default(''),
  country: text('country').notNull().default('India'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  placeId: text('place_id').notNull().default(''),
  phone: text('phone').notNull().default(''),
  openingHours: text('opening_hours').notNull().default('Mon–Sat: 9:30 AM – 8:30 PM'),
  locationSource: text('location_source').notNull().default('manual'), // map_pin | gps_consent | geocoded | manual
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Consent-gated, battery-efficient delivery partner location pings (active orders only)
export const deliveryLocationPings = pgTable('delivery_location_pings', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  tenantId: integer('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  deliveryPartnerId: integer('delivery_partner_id').references(() => deliveryPartners.id, {
    onDelete: 'set null',
  }),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  accuracyMeters: integer('accuracy_meters').notNull().default(0),
  batterySaverMode: boolean('battery_saver_mode').notNull().default(true),
  consentGranted: boolean('consent_granted').notNull().default(true),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  owner: one(users, {
    fields: [tenants.ownerUserId],
    references: [users.id],
  }),
  products: many(products),
  orders: many(orders),
  coupons: many(coupons),
  deliveryPartners: many(deliveryPartners),
  workflows: many(automationWorkflows),
  logs: many(automationLogs),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  reviews: many(reviews),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [orders.tenantId],
    references: [tenants.id],
  }),
  customer: one(users, {
    fields: [orders.customerUserId],
    references: [users.id],
  }),
  deliveryPartner: one(deliveryPartners, {
    fields: [orders.deliveryPartnerId],
    references: [deliveryPartners.id],
  }),
}));
