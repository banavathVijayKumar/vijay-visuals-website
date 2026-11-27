// ============================================================================
// Shared delivery milestone ordering.
//
// Every server path that can mutate an order or assignment must use these ranks
// so a client cannot move an order backwards (for example accepted -> dispatched
// or out_for_delivery -> accepted). `delivered` is terminal and is reachable
// only through the verified secure-POD write path.
// ============================================================================

export const DELIVERED_MILESTONE = 'delivered';
export const RETURNED_MILESTONE = 'returned';

/** UI milestone names accepted by delivery endpoints and their DB equivalents. */
export const UI_TO_DB_DELIVERY_STATUS: Record<string, string> = {
  placed: 'placed',
  accepted: 'confirmed',
  confirmed: 'confirmed',
  preparing: 'confirmed',
  ready_for_pickup: 'packed',
  packed: 'packed',
  out_for_delivery: 'out_for_delivery',
};

export const UI_TO_ASSIGNMENT_STATUS: Record<string, string> = {
  accepted: 'assigned',
  ready_for_pickup: 'assigned',
  out_for_delivery: 'in_transit',
  returned: 'returned',
};

const ORDER_STATUS_RANK: Record<string, number> = {
  placed: 10,
  confirmed: 20,
  accepted: 25,
  preparing: 25,
  assigned: 30,
  packed: 40,
  ready_for_pickup: 40,
  picked_up: 45,
  out_for_delivery: 50,
  return_requested: 60,
  delivered: 80,
  returned: 90,
  cancelled: 90,
  failed_attempt: 35,
};

const ASSIGNMENT_STATUS_RANK: Record<string, number> = {
  assigned: 20,
  accepted: 25,
  picked_up: 40,
  in_transit: 50,
  failed_attempt: 55,
  return_requested: 60,
  delivered: 80,
  returned: 90,
};

export function normalizeMilestone(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function orderStatusRank(raw: unknown): number {
  const status = normalizeMilestone(raw);
  return ORDER_STATUS_RANK[status] ?? 0;
}

export function assignmentStatusRank(raw: unknown): number {
  const status = normalizeMilestone(raw);
  return ASSIGNMENT_STATUS_RANK[status] ?? 0;
}

export function isTerminalDeliveryStatus(raw: unknown): boolean {
  const status = normalizeMilestone(raw);
  return status === 'delivered' || status === 'returned' || status === 'cancelled';
}

export function isSecurePodEligibleStatus(raw: unknown): boolean {
  const status = normalizeMilestone(raw);
  return ['confirmed', 'accepted', 'preparing', 'packed', 'ready_for_pickup', 'out_for_delivery'].includes(status);
}

/** True when the next milestone would move a delivery backwards. */
export function isBackwardDeliveryTransition(currentRaw: unknown, nextRaw: unknown): boolean {
  const current = normalizeMilestone(currentRaw);
  const next = normalizeMilestone(nextRaw);
  if (!current || !next) return false;
  if (isTerminalDeliveryStatus(current)) return true;
  return orderStatusRank(next) < orderStatusRank(current);
}

export function isBackwardAssignmentTransition(currentRaw: unknown, nextRaw: unknown): boolean {
  const current = normalizeMilestone(currentRaw);
  const next = normalizeMilestone(nextRaw);
  if (!current || !next) return false;
  if (isTerminalDeliveryStatus(current)) return true;
  return assignmentStatusRank(next) < assignmentStatusRank(current);
}

export function toDbOrderStatus(raw: unknown): string {
  const normalized = normalizeMilestone(raw);
  return UI_TO_DB_DELIVERY_STATUS[normalized] || normalized;
}

export function toAssignmentStatus(raw: unknown): string {
  const normalized = normalizeMilestone(raw);
  return UI_TO_ASSIGNMENT_STATUS[normalized] || normalized;
}
