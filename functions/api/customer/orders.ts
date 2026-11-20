// ============================================================================
// GET /api/customer/orders — Authenticated Customer's Own Orders Only
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { isMissingTableError, mapOrderRowToUi } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ orders: [] });

  try {
    const res = await env.DB.prepare(
      `SELECT o.*, p.rowid AS tenant_rowid
       FROM store_orders o
       LEFT JOIN customer_website_publications p ON p.website_id = o.website_id
       WHERE o.customer_user_id = ? OR LOWER(o.customer_email) = LOWER(?)
       ORDER BY o.created_at DESC
       LIMIT 100`
    )
      .bind(auth.user.id, auth.user.email)
      .all<Record<string, any>>();

    const orders = (res.results || []).map((row) =>
      mapOrderRowToUi(row, Number(row.tenant_rowid || 0))
    );
    return jsonResponse({ orders });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ orders: [] });
    }
    return jsonResponse({ error: 'Unable to load your orders.' }, 500);
  }
}
