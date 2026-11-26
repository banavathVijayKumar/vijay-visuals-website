// ============================================================================
// GET /api/owner/tenants/:tenantId/inventory-ops
// Cloudflare Pages / D1 port of the Express Business OS inventory operations.
// Preserves the Express response shape while reading real D1 columns:
// store_products, purchase_orders, stock_movements, inventory_warehouses,
// inventory_suppliers. Express-only PO fields are kept in purchase_orders.items_json.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
} from '../../../_shared';
import { parseProductMeta, requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

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

interface StockNoteMeta {
  reason: string;
  sourceType?: string;
  skuBarcode?: string;
  expiryDate?: string;
  unitCostInr?: number;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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

function decodeStockNote(raw: unknown): StockNoteMeta {
  const text = String(raw || '');
  if (text.trimStart().startsWith('{')) {
    const parsed = parseJsonObject(text);
    return {
      reason: String(parsed.reason || ''),
      sourceType: String(parsed.sourceType || ''),
      skuBarcode: String(parsed.skuBarcode || ''),
      expiryDate: String(parsed.expiryDate || ''),
      unitCostInr: toInt(parsed.unitCostInr, 0),
    };
  }
  return { reason: text, sourceType: '', skuBarcode: '', expiryDate: '', unitCostInr: 0 };
}

function mapPurchaseOrder(row: Record<string, any>, tenantRowId: number): Record<string, unknown> {
  const meta = parseJsonObject(row.items_json) as PurchaseOrderMeta;
  return {
    id: toInt(row.id),
    tenantId: tenantRowId,
    poNumber: String(row.po_number || ''),
    supplierId: row.supplier_id ? toInt(row.supplier_id) : null,
    supplierName: String(meta.supplierName || ''),
    productId: meta.productId ? toInt(meta.productId) : null,
    itemName: String(meta.itemName || ''),
    quantity: toInt(meta.quantity, 0),
    unitCostInr: toInt(meta.unitCostInr, 0),
    totalCostInr: toInt(row.total_cost_inr, 0),
    status: String(row.status || 'ordered'),
    paymentStatus: String(meta.paymentStatus || 'unpaid'),
    expectedDate: String(meta.expectedDate || ''),
    receivedAt: meta.receivedAt || null,
    notes: String(meta.notes || ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapStockMovement(row: Record<string, any>, tenantRowId: number): Record<string, unknown> {
  const meta = decodeStockNote(row.reference_note);
  const d1Type = String(row.movement_type || 'manual_adjustment');
  const fallbackType =
    d1Type === 'damage_out'
      ? 'damaged'
      : d1Type === 'return_in'
        ? 'adjustment'
        : d1Type;
  return {
    id: toInt(row.id),
    tenantId: tenantRowId,
    productId: toInt(row.product_id, 0),
    warehouseId: row.warehouse_id ? toInt(row.warehouse_id) : null,
    movementType: meta.sourceType || fallbackType,
    quantityDelta: toInt(row.delta_qty, 0),
    unitCostInr: Math.max(0, meta.unitCostInr || 0),
    skuBarcode: meta.skuBarcode || '',
    expiryDate: meta.expiryDate || '',
    reason: meta.reason || '',
    actorEmail: String(row.actor_id || ''),
    createdAt: toIso(row.created_at),
  };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const [productRes, poRes, movementRes, warehouseRes, supplierRes] = await Promise.all([
      env.DB.prepare(
        `SELECT id, category, name, description, price_inr, stock_qty, low_stock_threshold,
                sku, barcode, variants_json, images_json, is_active, created_at
         FROM store_products WHERE website_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 500`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, supplier_id, po_number, items_json, total_cost_inr, status, created_at, updated_at
         FROM purchase_orders WHERE website_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 500`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, product_id, warehouse_id, delta_qty, movement_type, reference_note, actor_id, created_at
         FROM stock_movements WHERE website_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 100`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, name, address, manager_name, is_default
         FROM inventory_warehouses WHERE website_id = ? ORDER BY id DESC LIMIT 50`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, name, contact_phone, contact_email, gst_number, notes
         FROM inventory_suppliers WHERE website_id = ? ORDER BY id DESC LIMIT 50`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
    ]);

    const pos = (poRes.results || []).map((r) => mapPurchaseOrder(r, tenantRowId));
    const movements = (movementRes.results || []).map((r) => mapStockMovement(r, tenantRowId));

    // Latest recorded unit cost from purchase orders, newest order first.
    const latestCostByProduct = new Map<number, number>();
    for (const po of pos) {
      const productId = Number(po.productId || 0);
      const unitCost = Number(po.unitCostInr || 0);
      if (productId > 0 && unitCost > 0 && !latestCostByProduct.has(productId)) {
        latestCostByProduct.set(productId, unitCost);
      }
    }

    let retailValuationInr = 0;
    let costValuationInr = 0;
    let totalUnitsInStock = 0;
    let productsWithCostCount = 0;

    const products = (productRes.results || []).map((p) => {
      const id = toInt(p.id);
      const stock = toInt(p.stock_qty, 0);
      const price = toInt(p.price_inr, 0);
      const wholesalePrice = parseProductMeta(p.variants_json).wholesalePrice;
      const recordedUnitCost = latestCostByProduct.get(id) || 0;
      if (recordedUnitCost > 0) productsWithCostCount += 1;
      retailValuationInr += stock * price;
      costValuationInr += stock * (recordedUnitCost || wholesalePrice || 0);
      totalUnitsInStock += stock;

      let images: string[] = [];
      try {
        const parsed = JSON.parse(String(p.images_json || '[]'));
        if (Array.isArray(parsed)) images = parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        images = [];
      }

      return {
        id,
        tenantId: tenantRowId,
        category: String(p.category || 'General'),
        name: String(p.name || ''),
        description: String(p.description || ''),
        price,
        stock,
        lowStockThreshold: toInt(p.low_stock_threshold, 5),
        skuCode: `VV-${tenantRowId}-${String(id).padStart(4, '0')}`,
        sku: String(p.sku || ''),
        barcode: String(p.barcode || ''),
        images,
        imageUrl: images[0] || '',
        active: Boolean(p.is_active),
        wholesalePrice,
        recordedUnitCost,
        retailValueInr: stock * price,
        createdAt: toIso(p.created_at),
      };
    });

    const damagedUnits = movements
      .filter((m) => String(m.movementType) === 'damaged')
      .reduce((sum, m) => sum + Math.abs(toInt(m.quantityDelta, 0)), 0);

    const todayIso = new Date().toISOString().slice(0, 10);
    const expiringSoon = movements
      .filter((m) => {
        const expiry = String(m.expiryDate || '');
        return Boolean(expiry) && expiry >= todayIso;
      })
      .sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)))
      .slice(0, 10);

    const warehouses = (warehouseRes.results || []).map((w) => ({
      id: toInt(w.id),
      tenantId: tenantRowId,
      name: String(w.name || ''),
      city: String(w.address || ''),
      capacityUnits: 5000,
      managerName: String(w.manager_name || ''),
      active: true,
    }));

    const suppliers = (supplierRes.results || []).map((s) => ({
      id: toInt(s.id),
      tenantId: tenantRowId,
      name: String(s.name || ''),
      contactPhone: String(s.contact_phone || ''),
      gstin: String(s.gst_number || ''),
      category: 'General Wholesale',
      leadTimeDays: 3,
      notes: String(s.notes || ''),
    }));

    const supplierOutstandingInr = pos
      .filter(
        (p) => String(p.status) !== 'cancelled' && String(p.paymentStatus) !== 'paid'
      )
      .reduce((sum, p) => sum + Number(p.totalCostInr || 0), 0);

    return jsonResponse({
      products,
      purchaseOrders: pos,
      stockMovements: movements,
      warehouses,
      suppliers,
      valuation: {
        totalUnitsInStock,
        retailValuationInr,
        estimatedCostValuationInr: costValuationInr,
        productsWithRecordedCost: productsWithCostCount,
        totalProducts: products.length,
        damagedUnitsRecorded: damagedUnits,
        supplierOutstandingInr,
      },
      expiringSoon,
    });
  } catch {
    return jsonResponse({ error: 'Unable to load inventory and purchase operations.' }, 500);
  }
}
