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
    const order = await env.DB.prepare(
      'SELECT * FROM store_orders WHERE UPPER(order_number) = ? LIMIT 1'
    )
      .bind(orderNumber)
      .first<Record<string, any>>();

    if (!order) {
      return jsonResponse({ error: `Order "${orderNumber}" was not found.` }, 404);
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
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Order tracking requires D1 migration 0003 (store_orders).', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to track order right now.' }, 500);
  }
}
