// ============================================================================
// GET /api/delivery/orders/:id/products — assignment-scoped pickup catalog
//
// Read-only helper for delivery pickup verification. It exposes only product
// identity fields (no customer PII) and only after the existing server-side
// assignment authority proves the caller owns this specific order.
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';
import { checkAssignedDeliveryAccess } from '../../_assignmentAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonResponse({ error: 'Invalid order ID.' }, 400);
  }

  try {
    const order = await env.DB.prepare(
      'SELECT id, website_id FROM store_orders WHERE id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id: number; website_id: string }>();

    if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

    const access = await checkAssignedDeliveryAccess(
      env,
      auth.user,
      String(order.website_id || ''),
      orderId
    );
    if (!access.authorized) {
      return jsonResponse(
        { error: 'Only the assigned delivery partner or business owner can view pickup items.' },
        403
      );
    }

    const result = await env.DB.prepare(
      `SELECT id, name, sku, barcode, stock_qty, is_active
       FROM store_products
       WHERE website_id = ? AND is_active = 1
       ORDER BY name ASC, id ASC LIMIT 200`
    )
      .bind(String(order.website_id || ''))
      .all<Record<string, any>>();

    const products = (result.results || []).map((p) => ({
      id: Number(p.id),
      name: String(p.name || ''),
      sku: String(p.sku || ''),
      barcode: String(p.barcode || ''),
      stock: Number(p.stock_qty || 0),
      active: Number(p.is_active) === 1,
    }));

    return jsonResponse({ products });
  } catch {
    return jsonResponse({ error: 'Unable to load pickup items.' }, 500);
  }
}
