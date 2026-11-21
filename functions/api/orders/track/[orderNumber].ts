// ============================================================================
// GET /api/orders/track/:orderNumber — Public Order Status Tracking
// ============================================================================

import { PagesContext, handleOptions, jsonResponse, sanitizeText } from '../../_shared';
import { isMissingTableError, mapOrderRowToUi } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ orderNumber: string }>
): Promise<Response> {
  const { env, params } = context;
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
              customer_name: custOrder.customer_name || 'Customer',
              customer_phone: custOrder.customer_phone || '',
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
      'SELECT rowid, business_name, website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(order.website_id)
      .first<{ rowid?: number; business_name: string; website_json: string }>();

    let tenantPhone = '';
    try {
      const parsed = pub?.website_json ? JSON.parse(pub.website_json) : {};
      tenantPhone = String(parsed.phone || '');
    } catch {}

    return jsonResponse({
      order: mapOrderRowToUi(order, Number(pub?.rowid || 0)),
      tenantName: pub?.business_name || 'Vijay Visuals Store',
      tenantPhone,
      deliveryPartner: null,
    });
  } catch (err) {
    return jsonResponse(
      { error: `Order "${orderNumber}" was not found. Please verify your order number.` },
      404
    );
  }
}
