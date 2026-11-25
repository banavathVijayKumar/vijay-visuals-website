// ============================================================================
// Customer-facing order tracking shape.
// Pure helper shared by the legacy Express route and local regression tests so
// public lookups can never return the raw order row, internal IDs, gateway
// references, notes, or delivery partner contact details.
// ============================================================================

import { maskPaymentReference } from './paymentDisplay';

export interface PublicTrackingOrder {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  itemsJson: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentReference: string;
  paymentStatus: string;
  status: string;
  invoiceNumber: string;
  isWholesale: boolean;
  createdAt: string | Date;
}

export interface PublicTrackingTenant {
  name?: string | null;
  phone?: string | null;
}

function maskCustomerName(value: string): string {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 1 ? part : part[0] + '*'.repeat(part.length - 1)))
    .join(' ');
}

function maskPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 4 ? `******${digits.slice(-4)}` : '******';
}

function maskEmail(value: string): string {
  const email = String(value || '').toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local[0]}***${local.length > 1 ? local[local.length - 1] : ''}@${domain}`;
}

function maskAddress(value: string): string {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? `Protected Address, ${parts[parts.length - 1].slice(0, 60)}` : 'Protected Address';
}

/** Returns only the fields a customer may see on an unauthenticated tracking lookup. */
export function buildPublicTrackingResponse(order: PublicTrackingOrder, tenant?: PublicTrackingTenant | null) {
  return {
    order: {
      id: 0,
      orderNumber: order.orderNumber,
      tenantId: 0,
      customerUserId: null,
      customerName: maskCustomerName(order.customerName),
      customerPhone: maskPhone(order.customerPhone),
      customerEmail: maskEmail(order.customerEmail),
      shippingAddress: maskAddress(order.shippingAddress),
      itemsJson: order.itemsJson,
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.deliveryFee,
      total: order.total,
      couponCode: '',
      paymentMethod: order.paymentMethod,
      paymentReference: maskPaymentReference(order.paymentReference),
      paymentStatus: order.paymentStatus,
      status: order.status,
      deliveryPartnerId: null,
      deliveryCommission: 0,
      invoiceNumber: order.invoiceNumber,
      isWholesale: order.isWholesale,
      notes: '',
      createdAt: order.createdAt,
    },
    tenantName: tenant?.name || 'Store',
    tenantPhone: tenant?.phone || '',
    deliveryPartner: null,
  };
}
