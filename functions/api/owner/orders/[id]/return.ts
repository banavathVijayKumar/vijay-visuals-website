// ============================================================================
// POST /api/owner/orders/:id/return — Return Request Decision
// Approve: return_requested -> returned, with idempotent stock restoration.
// Reject:  return_requested -> delivered, with no stock or payment mutation.
// Payment status is NEVER changed here: refunds require a verified Cashfree
// refund flow and owner/gateway approval. No email, SMS or payout is sent.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  CloudflareEnv,
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import {
  isMissingTableError,
  mapOrderRowToUi,
  requireTenantOwnerAccess,
} from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function parseOrderLines(raw: unknown): Array<{ productId: number; quantity: number }> {
  let parsed: any[] = [];
  try {
    const value = JSON.parse(String(raw || '[]'));
    if (Array.isArray(value)) parsed = value;
  } catch {
    return [];
  }
  return parsed
    .map((item) => ({
      productId: Number(item?.productId || item?.id),
      quantity: Math.max(0, Math.round(Number(item?.qty || item?.quantity || 0))),
    }))
    .filter((line) => Number.isInteger(line.productId) && line.productId > 0 && line.quantity > 0);
}

async function restoreReturnedStock(
  env: CloudflareEnv,
  input: {
    websiteId: string;
    orderNumber: string;
    lines: Array<{ productId: number; quantity: number }>;
    actorId: string;
  }
): Promise<number> {
  const db = env.DB;
  if (!db) return 0;
  const reference = `return_release:${input.orderNumber}`;
  let restored = 0;

  for (const line of input.lines) {
    try {
      const existing = await db.prepare(
        `SELECT id FROM stock_movements
         WHERE website_id = ? AND product_id = ? AND movement_type = 'return_in' AND reference_note = ?
         LIMIT 1`
      )
        .bind(input.websiteId, line.productId, reference)
        .first<{ id: number }>();
      if (existing) continue;
    } catch {
      // Without the ledger, skip the increment rather than risk duplicate stock.
      continue;
    }

    try {
      const updated = await db.prepare(
        `UPDATE store_products
         SET stock_qty = stock_qty + ?, updated_at = datetime('now')
         WHERE id = ? AND website_id = ?`
      )
        .bind(line.quantity, line.productId, input.websiteId)
        .run();
      if (!Number(updated?.meta?.changes || 0)) continue;
      await db.prepare(
        `INSERT INTO stock_movements
         (website_id, product_id, delta_qty, movement_type, reference_note, actor_id, created_at)
         VALUES (?, ?, ?, 'return_in', ?, ?, datetime('now'))`
      )
        .bind(input.websiteId, line.productId, line.quantity, reference, input.actorId)
        .run();
      restored += 1;
    } catch {
      // A failed compensation must not turn an already-approved return into a
      // client-visible failure that could be retried and double-restore stock.
    }
  }
  return restored;
}

export async function onRequestPost(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return jsonResponse({ error: 'Database storage is not configured.' }, 503);

  const orderId = Number(params?.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonResponse({ error: 'Invalid order ID.' }, 400);
  }

  const body = await parseJsonBody<{
    action?: string;
    decision?: string;
    note?: string;
    refundReference?: string;
  }>(request);
  const rawDecision = String(body?.action || body?.decision || '').toLowerCase();
  if (rawDecision !== 'approve' && rawDecision !== 'reject') {
    return jsonResponse({ error: 'Decision must be "approve" or "reject".' }, 400);
  }
  const decision = rawDecision;
  const note = sanitizeText(body?.note, 300);
  // Recorded for operator traceability only. This endpoint does not move money.
  const refundReference = sanitizeText(body?.refundReference, 200);

  let existing: Record<string, any> | null = null;
  try {
    existing = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ error: 'Orders require D1 migration 0003.', code: 'MIGRATION_REQUIRED' }, 503);
    }
    return jsonResponse({ error: 'Unable to load order.' }, 500);
  }
  if (!existing) return jsonResponse({ error: 'Order not found.' }, 404);

  const access = await requireTenantOwnerAccess(env, auth.user, String(existing.website_id), [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  if (String(existing.order_status) !== 'return_requested') {
    return jsonResponse(
      {
        error: 'Only orders with a pending return request can be approved or rejected.',
        code: 'RETURN_NOT_PENDING',
      },
      409
    );
  }

  const nextOrderStatus = decision === 'approve' ? 'returned' : 'delivered';
  const write = await env.DB.prepare(
    `UPDATE store_orders
     SET order_status = ?, return_reason = ?, updated_at = datetime('now')
     WHERE id = ? AND website_id = ? AND order_status = 'return_requested'`
  )
    .bind(
      nextOrderStatus,
      note || String(existing.return_reason || ''),
      orderId,
      String(existing.website_id)
    )
    .run();
  if (!Number(write?.meta?.changes || 0)) {
    return jsonResponse(
      { error: 'Return request state changed. Reload and retry.', code: 'RETURN_STATE_CHANGED' },
      409
    );
  }

  const restoredLines =
    decision === 'approve'
      ? await restoreReturnedStock(env, {
          websiteId: String(existing.website_id),
          orderNumber: String(existing.order_number || orderId),
          lines: parseOrderLines(existing.items_json),
          actorId: String(auth.user.id),
        })
      : 0;

  try {
    await env.DB.prepare(
      `UPDATE order_return_requests
       SET status = ?, decided_at = datetime('now'), decided_by = ?, decision_note = ?,
           refund_reference = ?, restocked = ?, updated_at = datetime('now')
       WHERE order_id = ? AND website_id = ? AND status = 'requested'`
    )
      .bind(
        decision === 'approve' ? 'approved' : 'rejected',
        String(auth.user.id),
        note,
        refundReference,
        restoredLines > 0 && decision === 'approve' ? 1 : 0,
        orderId,
        String(existing.website_id)
      )
      .run();
  } catch (err) {
    if (!isMissingTableError(err)) {
      // The order decision is already authoritative; the ledger is best-effort.
    }
  }

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: decision === 'approve' ? 'OWNER_RETURN_APPROVED' : 'OWNER_RETURN_REJECTED',
    targetType: 'order',
    targetId: String(orderId),
    details: {
      websiteId: String(existing.website_id),
      fromStatus: 'return_requested',
      toStatus: nextOrderStatus,
      restoredProductLines: restoredLines,
      refundStatus: 'not_processed',
      refundReferenceRecorded: Boolean(refundReference),
    },
  });

  const updated = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
    .bind(orderId)
    .first<Record<string, any>>();

  return jsonResponse({
    order: updated ? mapOrderRowToUi(updated, Number(access.row.rowid || 0)) : null,
    refund: {
      status: 'not_processed',
      message: 'Gateway refund must be processed separately through a verified Cashfree refund flow.',
    },
  });
}
