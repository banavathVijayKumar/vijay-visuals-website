// ============================================================================
// CONSERVATIVE DELIVERY ETA ESTIMATOR (NO PERSISTENCE, NO PROVIDER CALL)
//
// Computes a clearly non-guaranteed range on read from fields that already
// exist in D1. No migration, no Maps Distance Matrix call, no live-traffic
// claim, and no fixed promise are introduced.
// ============================================================================

import type { CloudflareEnv } from '../_shared';
import { isAutoAssignmentEligible } from './_riderState';

export interface EtaLineItem {
  name?: unknown;
  category?: unknown;
  quantity?: unknown;
}

export interface EtaEstimateInput {
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  items?: EtaLineItem[];
  availableRiders?: number;
  distanceKm?: number | null;
  mapsConfigured?: boolean;
  now?: Date;
}

export interface DeliveryEtaEstimate {
  estimated: true;
  nonGuaranteed: true;
  noLiveTraffic: true;
  minMinutes: number;
  maxMinutes: number;
  delayed: boolean;
  mapsConfigured: boolean;
  basis: string[];
}

const PREPARED_FOOD_PATTERN = /chicken|meat|mutton|fish|food|meal|biryani|pizza|bakery|cooked|restaurant/i;

function parseTimestamp(value: unknown): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function baseRange(items: EtaLineItem[]): { min: number; max: number; tier: string } {
  const quantity = items.reduce((sum, item) => {
    const value = Number(item?.quantity || 1);
    return sum + (Number.isFinite(value) && value > 0 ? value : 1);
  }, 0);
  const prepared = items.some((item) =>
    PREPARED_FOOD_PATTERN.test(`${String(item?.name || '')} ${String(item?.category || '')}`)
  );

  if (quantity > 20) return { min: 60, max: 120, tier: 'bulk order' };
  if (quantity > 8 || (prepared && quantity > 4)) {
    return { min: 45, max: 60, tier: 'larger or freshly prepared order' };
  }
  if (quantity > 3 || prepared) return { min: 30, max: 45, tier: 'medium order' };
  return { min: 20, max: 30, tier: 'small nearby order' };
}

function stageFactor(status: string): number {
  if (status === 'delivered') return 0;
  if (status === 'out_for_delivery') return 0.3;
  if (status === 'packed' || status === 'ready_for_pickup') return 0.5;
  if (status === 'preparing') return 0.85;
  return 1;
}

export function estimateDeliveryEta(input: EtaEstimateInput): DeliveryEtaEstimate {
  const items = Array.isArray(input.items) ? input.items : [];
  const range = baseRange(items);
  const status = String(input.status || '').toLowerCase();
  const basis = [`based on ${range.tier} and current order stage`];

  let minMinutes = range.min;
  let maxMinutes = range.max;

  const distance = Number(input.distanceKm);
  if (Number.isFinite(distance) && distance > 3) {
    const allowance = Math.round((distance - 3) * 2);
    minMinutes += allowance;
    maxMinutes += allowance;
    basis.push('straight-line distance allowance added; no live traffic routing');
  } else {
    basis.push('no verified delivery distance or live traffic routing available');
  }

  if (Number(input.availableRiders) <= 0) {
    minMinutes += 15;
    maxMinutes += 30;
    basis.push('no available rider buffer added');
  }

  const factor = stageFactor(status);
  minMinutes = Math.max(0, Math.round(minMinutes * factor));
  maxMinutes = Math.max(minMinutes, Math.round(maxMinutes * factor));
  if (status === 'delivered') basis.push('delivery already completed');

  let delayed = false;
  const now = input.now instanceof Date ? input.now.getTime() : Date.now();
  const startedAt = parseTimestamp(input.createdAt) ?? now;
  const elapsedMinutes = Math.max(0, Math.floor((now - startedAt) / 60000));
  if (status !== 'delivered' && elapsedMinutes > maxMinutes) {
    const overtime = Math.min(120, elapsedMinutes - maxMinutes);
    minMinutes += Math.round(overtime / 2);
    maxMinutes += overtime;
    delayed = true;
    basis.push('order is running later than the initial estimate');
  }

  return {
    estimated: true,
    nonGuaranteed: true,
    noLiveTraffic: true,
    minMinutes,
    maxMinutes,
    delayed,
    mapsConfigured: Boolean(input.mapsConfigured),
    basis,
  };
}

function parseItemsJson(value: unknown): EtaLineItem[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? (parsed as EtaLineItem[]) : [];
  } catch {
    return [];
  }
}

/** Read-only ETA for an existing store_orders row. Never writes to D1. */
export async function estimateEtaForOrder(
  env: CloudflareEnv,
  order: Record<string, any>
): Promise<DeliveryEtaEstimate> {
  let availableRiders = 0;
  try {
    if (env.DB) {
      // Only owner-approved riders who explicitly went online are available.
      // Offline riders keep assignment authority but are excluded from ETAs.
      const rows = await env.DB.prepare(
        `SELECT role, status, permissions_json FROM tenant_memberships WHERE website_id = ?`
      )
        .bind(String(order.website_id || ''))
        .all<{ role?: string; status?: string; permissions_json?: string }>();
      availableRiders = (rows.results || []).filter((row) => isAutoAssignmentEligible(row)).length;
    }
  } catch {
    // Unknown availability never invents a rider. The estimate stays explicitly
    // non-guaranteed and no external lookup is attempted.
  }

  const mapsConfigured = Boolean(
    String(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
  );

  return estimateDeliveryEta({
    status: order.order_status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: parseItemsJson(order.items_json),
    availableRiders,
    distanceKm: null,
    mapsConfigured,
  });
}
