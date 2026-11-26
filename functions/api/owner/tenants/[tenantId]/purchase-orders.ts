// ============================================================================
// POST /api/owner/tenants/:tenantId/purchase-orders
// Cloudflare Pages / D1 port of the Express Business OS purchase order creator.
// Express-only columns are preserved inside purchase_orders.items_json.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

interface PurchaseOrderMeta {
  supplierName: string;
  productId: number | null;
  itemName: string;
  quantity: number;
  unitCostInr: number;
  expectedDate: string;
  notes: string;
  paymentStatus: 'unpaid' | 'paid';
  receivedAt?: string | null;
}

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

function mapPurchaseOrder(row: Record<string, any>, tenantRowId: number): Record<string, unknown> {
  const meta = parseJsonObject(row.items_json) as Partial<PurchaseOrderMeta>;
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

  const supplierName = sanitizeText(body.supplierName, 120);
  const itemName = sanitizeText(body.itemName, 140);
  const supplierId = toOptionalId(body.supplierId);
  const productId = toOptionalId(body.productId);
  const quantity = toPositiveInt(body.quantity);
  const unitCostInr = toPositiveInt(body.unitCostInr);
  const expectedDate = sanitizeText(body.expectedDate, 20);
  const notes = sanitizeText(body.notes, 400);

  if (supplierName.length < 2 || itemName.length < 2 || quantity <= 0 || unitCostInr <= 0) {
    return jsonResponse(
      { error: 'Provide supplier name, item name, positive quantity, and unit cost.' },
      400
    );
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);

  try {
    // Never allow an ID from another tenant through the supplier/product FKs.
    if (supplierId) {
      const supplier = await env.DB.prepare(
        'SELECT id FROM inventory_suppliers WHERE id = ? AND website_id = ? LIMIT 1'
      )
        .bind(supplierId, websiteId)
        .first<{ id: number }>();
      if (!supplier) return jsonResponse({ error: 'Supplier not found in this business.' }, 404);
    }

    if (productId) {
      const product = await env.DB.prepare(
        'SELECT id FROM store_products WHERE id = ? AND website_id = ? LIMIT 1'
      )
        .bind(productId, websiteId)
        .first<{ id: number }>();
      if (!product) return jsonResponse({ error: 'Product not found in this business.' }, 404);
    }

    const poNumber = `PO-${tenantRowId}-${Date.now().toString().slice(-6)}`;
    const totalCostInr = quantity * unitCostInr;
    const meta: PurchaseOrderMeta = {
      supplierName,
      productId,
      itemName,
      quantity,
      unitCostInr,
      expectedDate,
      notes,
      paymentStatus: 'unpaid',
      receivedAt: null,
    };

    const insertRes = await env.DB.prepare(
      `INSERT INTO purchase_orders
        (website_id, owner_id, supplier_id, po_number, items_json, total_cost_inr, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ordered', datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        access.row.owner_id,
        supplierId,
        poNumber,
        JSON.stringify(meta),
        totalCostInr
      )
      .run();

    const createdId = Number(insertRes.meta?.last_row_id || 0);
    const createdRow =
      createdId > 0
        ? await env.DB.prepare(
            `SELECT id, supplier_id, po_number, items_json, total_cost_inr, status, created_at, updated_at
             FROM purchase_orders WHERE id = ? AND website_id = ? LIMIT 1`
          )
            .bind(createdId, websiteId)
            .first<Record<string, any>>()
        : null;

    const purchaseOrder = createdRow
      ? mapPurchaseOrder(createdRow, tenantRowId)
      : {
          id: createdId,
          tenantId: tenantRowId,
          poNumber,
          supplierId,
          supplierName,
          productId,
          itemName,
          quantity,
          unitCostInr,
          totalCostInr,
          status: 'ordered',
          paymentStatus: 'unpaid',
          expectedDate,
          receivedAt: null,
          notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'PURCHASE_ORDER_CREATED',
      targetType: 'purchase_order',
      targetId: String(createdId),
      details: {
        websiteId,
        poNumber,
        quantity,
        itemName,
        supplierName,
        totalCostInr,
      },
    });

    return jsonResponse({ purchaseOrder }, 201);
  } catch {
    return jsonResponse({ error: 'Unable to create purchase order.' }, 500);
  }
}
