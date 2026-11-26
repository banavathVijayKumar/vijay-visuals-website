// ============================================================================
// PATCH /api/owner/tenants/:tenantId/purchase-orders/:id
// Cloudflare Pages / D1 port of the Express purchase-order update.
// Preserves stock increment, purchase_in movement and expense side effects
// using the real D1 tables (store_products, stock_movements, finance_ledger).
// ============================================================================

import { requireUser, type TenantRole } from '../../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../../_shared';
import { requireTenantOwnerAccess } from '../../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];
const UI_PO_STATUSES = ['ordered', 'received', 'cancelled'];

interface PurchaseOrderMeta {
  supplierName?: string;
  productId?: number | null;
  itemName?: string;
  quantity?: number;
  unitCostInr?: number;
  expectedDate?: string;
  notes?: string;
  paymentStatus?: string;
  receivedAt?: string | null;
}

function toIso(value: unknown): string {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(' ', 'T')}Z`;
  return s;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

function encodeStockNote(note: {
  reason: string;
  sourceType: string;
  skuBarcode: string;
  unitCostInr: number;
}): string {
  return JSON.stringify({
    reason: sanitizeText(note.reason, 240),
    sourceType: note.sourceType,
    skuBarcode: sanitizeText(note.skuBarcode, 64),
    expiryDate: '',
    unitCostInr: Math.max(0, Math.trunc(Number(note.unitCostInr) || 0)),
  });
}

function mapPurchaseOrder(row: Record<string, any>, tenantRowId: number): Record<string, unknown> {
  const meta = parseJsonObject(row.items_json) as PurchaseOrderMeta;
  return {
    id: Number(row.id) || 0,
    tenantId: tenantRowId,
    poNumber: String(row.po_number || ''),
    supplierId: row.supplier_id ? Number(row.supplier_id) : null,
    supplierName: String(meta.supplierName || ''),
    productId: meta.productId ? Number(meta.productId) : null,
    itemName: String(meta.itemName || ''),
    quantity: Number(meta.quantity) || 0,
    unitCostInr: Number(meta.unitCostInr) || 0,
    totalCostInr: Number(row.total_cost_inr) || 0,
    status: String(row.status || 'ordered'),
    paymentStatus: String(meta.paymentStatus || 'unpaid'),
    expectedDate: String(meta.expectedDate || ''),
    receivedAt: meta.receivedAt || null,
    notes: String(meta.notes || ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string; id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Purchase order not found.' }, 404);
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);

  try {
    const existingRow = await env.DB.prepare(
      `SELECT id, supplier_id, po_number, items_json, total_cost_inr, status, created_at, updated_at
       FROM purchase_orders WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(id, websiteId)
      .first<Record<string, any>>();

    if (!existingRow) return jsonResponse({ error: 'Purchase order not found.' }, 404);

    const body = (await parseJsonBody<Record<string, any>>(request)) || {};
    const existing = parseJsonObject(existingRow.items_json) as PurchaseOrderMeta;
    const existingStatus = String(existingRow.status || 'ordered');

    const nextStatus = body.status ? String(body.status) : existingStatus;
    if (!UI_PO_STATUSES.includes(nextStatus)) {
      return jsonResponse({ error: 'Invalid purchase order status.' }, 400);
    }

    const requestedPaymentStatus = body.paymentStatus
      ? String(body.paymentStatus)
      : String(existing.paymentStatus || 'unpaid');
    if (requestedPaymentStatus !== 'paid' && requestedPaymentStatus !== 'unpaid') {
      return jsonResponse({ error: 'Invalid payment status.' }, 400);
    }
    const nextPaymentStatus = requestedPaymentStatus;

    const recordExpense = Boolean(body.recordExpense);
    const transitioningToReceived = existingStatus !== 'received' && nextStatus === 'received';
    const actorEmail = auth.user.email || auth.user.id;
    const productId = Number(existing.productId || 0) || 0;
    const quantity = Math.max(0, Math.trunc(Number(existing.quantity) || 0));
    const unitCostInr = Math.max(0, Math.trunc(Number(existing.unitCostInr) || 0));
    const supplierName = String(existing.supplierName || '');
    const itemName = String(existing.itemName || '');
    const poNumber = String(existingRow.po_number || '');

    const nextMeta: PurchaseOrderMeta = {
      ...existing,
      paymentStatus: nextPaymentStatus,
      receivedAt: transitioningToReceived ? new Date().toISOString() : existing.receivedAt || null,
    };

    await env.DB.prepare(
      `UPDATE purchase_orders SET status = ?, items_json = ?, updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(nextStatus, JSON.stringify(nextMeta), id, websiteId)
      .run();

    // Receiving a linked PO increments real D1 product stock and logs a purchase_in movement.
    if (transitioningToReceived && productId > 0 && quantity > 0) {
      const product = await env.DB.prepare(
        'SELECT id FROM store_products WHERE id = ? AND website_id = ? LIMIT 1'
      )
        .bind(productId, websiteId)
        .first<{ id: number }>();

      if (product) {
        await env.DB.prepare(
          `UPDATE store_products
           SET stock_qty = MAX(0, stock_qty + ?), updated_at = datetime('now')
           WHERE id = ? AND website_id = ?`
        )
          .bind(quantity, productId, websiteId)
          .run();

        const skuBarcode = `VV-${tenantRowId}-${String(productId).padStart(4, '0')}`;

        await env.DB.prepare(
          `INSERT INTO stock_movements
            (website_id, product_id, warehouse_id, delta_qty, movement_type, reference_note, actor_id, created_at)
           VALUES (?, ?, NULL, ?, 'purchase_in', ?, ?, datetime('now'))`
        )
          .bind(
            websiteId,
            productId,
            quantity,
            encodeStockNote({
              reason: `Received ${poNumber} from ${supplierName}`,
              sourceType: 'purchase_in',
              skuBarcode,
              unitCostInr,
            }),
            actorEmail
          )
          .run();
      }
    }

    // Expense side effect is supported by finance_ledger; GST is stored in gst_inr.
    if (transitioningToReceived && recordExpense) {
      const totalCostInr = Number(existingRow.total_cost_inr) || 0;
      const gstAmountInr = Math.round((totalCostInr * 18) / 100);
      await env.DB.prepare(
        `INSERT INTO finance_ledger
          (website_id, owner_id, entry_type, category, amount_inr, gst_inr, reference_id, notes,
           entry_date, created_by, created_at)
         VALUES (?, ?, 'expense', 'Inventory Purchase', ?, ?, ?, ?, date('now'), ?, datetime('now'))`
      )
        .bind(
          websiteId,
          access.row.owner_id,
          totalCostInr,
          gstAmountInr,
          poNumber,
          `Auto-logged from ${poNumber}: ${quantity}x ${itemName}`,
          actorEmail
        )
        .run();
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'PURCHASE_ORDER_UPDATED',
      targetType: 'purchase_order',
      targetId: String(id),
      details: { websiteId, poNumber, status: nextStatus, paymentStatus: nextPaymentStatus },
    });

    const updatedRow = await env.DB.prepare(
      `SELECT id, supplier_id, po_number, items_json, total_cost_inr, status, created_at, updated_at
       FROM purchase_orders WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(id, websiteId)
      .first<Record<string, any>>();

    const purchaseOrder = updatedRow
      ? mapPurchaseOrder(updatedRow, tenantRowId)
      : {
          ...mapPurchaseOrder(existingRow, tenantRowId),
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          receivedAt: nextMeta.receivedAt,
        };

    return jsonResponse({ purchaseOrder });
  } catch {
    return jsonResponse({ error: 'Unable to update purchase order.' }, 500);
  }
}
