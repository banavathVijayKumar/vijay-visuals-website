// ============================================================================
// POST /api/owner/tenants/:tenantId/stock-movements
// Cloudflare Pages / D1 port of the Express Business OS stock movement logger.
// Maps Express movement types onto the D1 movement_type CHECK values while
// preserving the original UI type inside stock_movements.reference_note.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];
const UI_MOVEMENT_TYPES = ['purchase_in', 'sale_out', 'transfer', 'damaged', 'adjustment'];

const D1_MOVEMENT_TYPE: Record<string, string> = {
  purchase_in: 'purchase_in',
  sale_out: 'sale_out',
  transfer: 'manual_adjustment',
  damaged: 'damage_out',
  adjustment: 'manual_adjustment',
};

function toPositiveInt(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function toOptionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toIso(value: unknown): string {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(' ', 'T')}Z`;
  return s;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const productId = toPositiveInt(body.productId);
  const warehouseId = toOptionalId(body.warehouseId);
  const movementType = String(body.movementType || '');
  const quantity = toPositiveInt(body.quantity);
  const direction = body.direction === 'in' || body.direction === 'out' ? body.direction : '';
  const unitCostInr = Math.max(0, Math.trunc(Number(body.unitCostInr) || 0));
  const skuBarcodeInput = sanitizeText(body.skuBarcode, 64);
  const expiryDate = sanitizeText(body.expiryDate, 20);
  const reason = sanitizeText(body.reason, 240);

  if (
    productId <= 0 ||
    quantity <= 0 ||
    !UI_MOVEMENT_TYPES.includes(movementType) ||
    reason.length < 2
  ) {
    return jsonResponse(
      { error: 'Select product, positive quantity, and enter a clear reason.' },
      400
    );
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);
  const actorEmail = auth.user.email || auth.user.id;

  try {
    const product = await env.DB.prepare(
      `SELECT id, stock_qty FROM store_products WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(productId, websiteId)
      .first<{ id: number; stock_qty: number }>();

    if (!product) return jsonResponse({ error: 'Product not found in this business.' }, 404);

    if (warehouseId) {
      const warehouse = await env.DB.prepare(
        'SELECT id FROM inventory_warehouses WHERE id = ? AND website_id = ? LIMIT 1'
      )
        .bind(warehouseId, websiteId)
        .first<{ id: number }>();
      if (!warehouse) {
        return jsonResponse({ error: 'Warehouse not found in this business.' }, 404);
      }
    }

    let delta = quantity;
    if (
      movementType === 'damaged' ||
      movementType === 'sale_out' ||
      (movementType === 'adjustment' && direction === 'out')
    ) {
      delta = -quantity;
    } else if (movementType === 'transfer') {
      // Express keeps total stock unchanged for warehouse transfers.
      delta = 0;
    }

    let updatedStock = Math.max(0, Number(product.stock_qty || 0) + delta);
    if (delta !== 0) {
      await env.DB.prepare(
        `UPDATE store_products
         SET stock_qty = MAX(0, stock_qty + ?), updated_at = datetime('now')
         WHERE id = ? AND website_id = ?`
      )
        .bind(delta, productId, websiteId)
        .run();

      const refreshed = await env.DB.prepare(
        'SELECT stock_qty FROM store_products WHERE id = ? AND website_id = ? LIMIT 1'
      )
        .bind(productId, websiteId)
        .first<{ stock_qty: number }>();
      updatedStock = Math.max(0, Number(refreshed?.stock_qty ?? updatedStock));
    }

    const skuBarcode =
      skuBarcodeInput || `VV-${tenantRowId}-${String(productId).padStart(4, '0')}`;
    const referenceNote = JSON.stringify({
      reason,
      sourceType: movementType,
      skuBarcode,
      expiryDate,
      unitCostInr,
    });

    const insertRes = await env.DB.prepare(
      `INSERT INTO stock_movements
        (website_id, product_id, warehouse_id, delta_qty, movement_type, reference_note, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        productId,
        warehouseId,
        delta === 0 ? quantity : delta,
        D1_MOVEMENT_TYPE[movementType],
        referenceNote,
        actorEmail
      )
      .run();

    const movement = {
      id: Number(insertRes.meta?.last_row_id || 0),
      tenantId: tenantRowId,
      productId,
      warehouseId,
      movementType,
      quantityDelta: delta === 0 ? quantity : delta,
      unitCostInr,
      skuBarcode,
      expiryDate,
      reason,
      actorEmail,
      createdAt: new Date().toISOString(),
    };

    return jsonResponse({ movement, updatedStock }, 201);
  } catch {
    return jsonResponse({ error: 'Unable to record stock movement.' }, 500);
  }
}
