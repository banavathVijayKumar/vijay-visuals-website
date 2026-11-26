// ============================================================================
// SHARED STOCK RESERVATION / RELEASE HELPERS
// Reservation is performed through an atomic D1 batch by the caller. Releases
// are keyed by order number and recorded in stock_movements so retrying the
// same compensation cannot restore stock twice.
// ============================================================================

import { CloudflareEnv } from './_shared';

export interface StockReservationLine {
  productId: number;
  quantity: number;
  name?: string;
}

export const SANDBOX_TEST_PRODUCT_ID = 999999;

export function reservationLines(lines: StockReservationLine[]): StockReservationLine[] {
  return lines
    .map((line) => ({
      productId: Number(line.productId),
      quantity: Math.max(0, Math.round(Number(line.quantity) || 0)),
      name: line.name,
    }))
    .filter((line) =>
      Number.isInteger(line.productId) &&
      line.productId > 0 &&
      line.productId !== SANDBOX_TEST_PRODUCT_ID &&
      line.quantity > 0
    );
}

export function stockIsSufficient(
  products: Array<{ id: number; stock_qty: number }>,
  lines: StockReservationLine[]
): boolean {
  const available = new Map<number, number>();
  for (const product of products) {
    available.set(Number(product.id), Math.max(0, Math.floor(Number(product.stock_qty) || 0)));
  }
  for (const line of reservationLines(lines)) {
    if ((available.get(line.productId) || 0) < line.quantity) return false;
  }
  return true;
}

/**
 * Idempotently restores stock for an unpaid/failed order. The stock_movements
 * row is the compensation marker: if it already exists, stock is not restored
 * again. `return_in` is an allowed movement_type in migration 0003.
 */
export async function releaseReservedStock(
  env: CloudflareEnv,
  input: {
    websiteId: string;
    orderNumber: string;
    lines: StockReservationLine[];
    actorId?: string;
  }
): Promise<number> {
  const db = env.DB;
  if (!db) return 0;
  const reference = `failed_order_release:${input.orderNumber}`;
  const statements = [];

  for (const line of reservationLines(input.lines)) {
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
      // If the ledger is unavailable, skip the increment rather than risking
      // an untracked duplicate restoration.
      continue;
    }

    statements.push(
      db.prepare(
        `UPDATE store_products
         SET stock_qty = stock_qty + ?, updated_at = datetime('now')
         WHERE id = ? AND website_id = ?`
      ).bind(line.quantity, line.productId, input.websiteId),
      db.prepare(
        `INSERT INTO stock_movements
         (website_id, product_id, delta_qty, movement_type, reference_note, actor_id, created_at)
         VALUES (?, ?, ?, 'return_in', ?, ?, datetime('now'))`
      ).bind(
        input.websiteId,
        line.productId,
        line.quantity,
        reference,
        input.actorId || 'system'
      )
    );
  }

  if (!statements.length || !db.batch) return 0;
  try {
    const batch = db.batch;
    await batch.call(db, statements);
    return statements.length / 2;
  } catch {
    return 0;
  }
}
