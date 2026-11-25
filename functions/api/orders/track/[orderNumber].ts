// ============================================================================
// GET /api/orders/track/:orderNumber — Public Order Status Tracking
// Secure PII masking for unauthenticated public lookups (DPDP / GDPR Compliant).
// Full unmasked details returned only when authenticated or verified via phone/email.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, handleOptions, jsonResponse, sanitizeText } from '../../_shared';
import { isMissingTableError, mapOrderRowToUi } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function maskCustomerName(name: string): string {
  if (!name) return 'Customer';
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => (p.length <= 1 ? p : p[0] + '*'.repeat(Math.max(1, p.length - 1))))
    .join(' ');
}

function maskCustomerPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return '******';
  return '******' + digits.slice(-4);
}

function maskCustomerEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  const maskedLocal =
    local.length <= 2 ? local[0] + '***' : local[0] + '***' + local.slice(-1);
  return `${maskedLocal}@${domain}`;
}

function maskShippingAddress(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 'Protected Address (Verified)';
  // Only the final component (typically city/state) is safe to reveal.
  return 'Protected Address, ' + parts[parts.length - 1].slice(0, 60);
}

/** Payment references are gateway identifiers, never public tracking identifiers. */
function maskPaymentReference(reference: unknown): string {
  const clean = String(reference || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '••••';
  return `••••••${clean.slice(-4)}`;
}

export async function onRequestGet(
  context: PagesContext<{ orderNumber: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const orderNumber = sanitizeText(params.orderNumber, 40).toUpperCase();
  if (!orderNumber || orderNumber.length < 5) {
    return jsonResponse({ error: 'Please enter a valid Order ID.' }, 400);
  }
  if (!env.DB) {
    return jsonResponse({ error: 'Order tracking storage is not configured.' }, 503);
  }

  try {
    let order: Record<string, any> | null = null;
    try {
      order = await env.DB.prepare(
        'SELECT * FROM store_orders WHERE UPPER(order_number) = ? LIMIT 1'
      )
        .bind(orderNumber)
        .first<Record<string, any>>();
    } catch (storeOrdersErr) {
      // If store_orders table is not yet migrated, fall back to customer_orders table (Migration 0001)
      if (isMissingTableError(storeOrdersErr)) {
        try {
          const custOrder = await env.DB.prepare(
            'SELECT * FROM customer_orders WHERE UPPER(order_id) = ? OR UPPER(order_number) = ? LIMIT 1'
          )
            .bind(orderNumber, orderNumber)
            .first<Record<string, any>>();

          if (custOrder) {
            order = {
              id: custOrder.id || 1,
              order_number: custOrder.order_number || custOrder.order_id || orderNumber,
              website_id: custOrder.website_id || '',
              customer_user_id: custOrder.customer_user_id || null,
              customer_name: custOrder.customer_name || 'Customer',
              customer_phone: custOrder.customer_phone || '',
              customer_email: custOrder.customer_email || '',
              delivery_address: custOrder.delivery_address || '',
              delivery_city: custOrder.delivery_city || 'Hyderabad',
              total_amount_inr: custOrder.total_amount || 0,
              order_status: custOrder.order_status || 'placed',
              payment_method: custOrder.payment_method || 'cod',
              payment_status: custOrder.payment_status || 'pending',
              items_json: custOrder.items_json || '[]',
              created_at: custOrder.created_at || new Date().toISOString(),
            };
          }
        } catch {
          // Both tables missing or query failed
        }
      }
    }

    if (!order) {
      return jsonResponse(
        { error: `Order "${orderNumber}" was not found. Please verify your order number and phone number.` },
        404
      );
    }

    const pub = await env.DB.prepare(
      'SELECT rowid, owner_id, business_name, website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(order.website_id)
      .first<{ rowid?: number; owner_id?: string; business_name: string; website_json: string }>();

    let tenantPhone = '';
    try {
      const parsed = pub?.website_json ? JSON.parse(pub.website_json) : {};
      tenantPhone = String(parsed.phone || '');
    } catch {}

    const url = new URL(request.url);
    const verifyPhone = sanitizeText(url.searchParams.get('phone') || '', 30).replace(/\D/g, '');
    const verifyEmail = sanitizeText(url.searchParams.get('email') || '', 160).toLowerCase();

    let isAuthorized = false;

    // Check optional authenticated user
    if (request.headers.get('Authorization')) {
      try {
        const auth = await requireUser(request, env);
        if (auth.ok) {
          const u = auth.user;
          const orderCustomerUserId = String(order.customer_user_id || '');
          const orderCustomerEmail = String(order.customer_email || '').toLowerCase();
          if (
            u.isSuperAdmin ||
            (orderCustomerUserId && (orderCustomerUserId === u.id || orderCustomerUserId === u.authSubject)) ||
            (orderCustomerEmail && orderCustomerEmail === (u.email || '').toLowerCase()) ||
            (order.website_id && pub && pub.owner_id === u.id)
          ) {
            isAuthorized = true;
          }
        }
      } catch {}
    }

    // Check phone or email verification param. Require a strong match to
    // prevent PII disclosure from guessable 4-digit suffixes.
    if (!isAuthorized) {
      const orderPhoneDigits = String(order.customer_phone || '').replace(/\D/g, '');
      const orderEmailClean = String(order.customer_email || '').toLowerCase();

      const phoneMatches =
        verifyPhone.length >= 10 &&
        orderPhoneDigits.length >= 10 &&
        (verifyPhone === orderPhoneDigits ||
          verifyPhone.endsWith(orderPhoneDigits.slice(-10)) ||
          orderPhoneDigits.endsWith(verifyPhone.slice(-10)));

      if (verifyPhone && phoneMatches) {
        isAuthorized = true;
      } else if (verifyEmail && orderEmailClean && verifyEmail === orderEmailClean) {
        isAuthorized = true;
      }
    }

    const rawUiOrder = mapOrderRowToUi(order, Number(pub?.rowid || 0));

    // Only customer-relevant tracking fields leave this endpoint. Internal row
    // IDs, website IDs, gateway references, and ownership data are never sent.
    const publicOrder = {
      orderNumber: rawUiOrder.orderNumber,
      invoiceNumber: String(order.invoice_number || ''),
      customerName: String(rawUiOrder.customerName || ''),
      customerPhone: String(rawUiOrder.customerPhone || ''),
      customerEmail: String(rawUiOrder.customerEmail || ''),
      shippingAddress: String(rawUiOrder.shippingAddress || ''),
      itemsJson: rawUiOrder.itemsJson,
      subtotal: rawUiOrder.subtotal,
      discount: rawUiOrder.discount,
      deliveryFee: rawUiOrder.deliveryFee,
      gstAmount: rawUiOrder.gstAmount,
      total: rawUiOrder.total,
      paymentMethod: rawUiOrder.paymentMethod,
      paymentStatus: rawUiOrder.paymentStatus,
      paymentReference: maskPaymentReference(rawUiOrder.paymentReference),
      status: rawUiOrder.status,
      createdAt: rawUiOrder.createdAt,
      ...(isAuthorized ? { couponCode: rawUiOrder.couponCode, returnReason: rawUiOrder.returnReason } : {}),
    };

    const finalOrder = isAuthorized
      ? { ...publicOrder, isPiiMasked: false }
      : {
          ...publicOrder,
          customerName: maskCustomerName(publicOrder.customerName),
          customerPhone: maskCustomerPhone(publicOrder.customerPhone),
          customerEmail: maskCustomerEmail(publicOrder.customerEmail),
          shippingAddress: maskShippingAddress(publicOrder.shippingAddress),
          isPiiMasked: true,
        };

    return jsonResponse({
      order: finalOrder,
      tenantName: sanitizeText(pub?.business_name || '', 80) || 'Store',
      tenantPhone,
      deliveryPartner: null,
      verificationRequiredForFullPii: !isAuthorized,
    });
  } catch (err) {
    return jsonResponse(
      { error: `Order "${orderNumber}" was not found. Please verify your order number.` },
      404
    );
  }
}
