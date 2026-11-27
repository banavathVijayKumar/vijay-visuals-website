// ============================================================================
// Durable delivery-rider state stored INSIDE tenant_memberships.permissions_json.
//
// No new membership column is required. Approval and online/offline state are
// appended to the existing permission marker array so legacy JSON keeps working.
// Membership `status` remains the owner-controlled active/suspended gate.
// ============================================================================

export type DeliveryApprovalState = 'owner_approved' | 'owner_added' | 'pending' | 'revoked';
export type DeliveryAvailabilityState = 'online' | 'offline';

export interface DeliveryRiderState {
  deliveryApproval: DeliveryApprovalState;
  availability: DeliveryAvailabilityState;
}

const APPROVAL_PREFIX = 'deliveryApproval:';
const AVAILABILITY_PREFIX = 'availability:';

function parsePermissionArray(raw: unknown): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Plain-text legacy marker format below.
  }
  return text
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function markerValue(parts: string[], prefix: string): string {
  const hit = parts.find((item) => item.startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : '';
}

export function readRiderState(raw: unknown): DeliveryRiderState {
  const parts = parsePermissionArray(raw);
  const approvalRaw = markerValue(parts, APPROVAL_PREFIX);
  const availabilityRaw = markerValue(parts, AVAILABILITY_PREFIX);
  const approvals: DeliveryApprovalState[] = ['owner_approved', 'owner_added', 'pending', 'revoked'];
  const availabilities: DeliveryAvailabilityState[] = ['online', 'offline'];

  return {
    deliveryApproval: approvals.includes(approvalRaw as DeliveryApprovalState)
      ? (approvalRaw as DeliveryApprovalState)
      : 'pending',
    availability: availabilities.includes(availabilityRaw as DeliveryAvailabilityState)
      ? (availabilityRaw as DeliveryAvailabilityState)
      : 'offline',
  };
}

/** Returns a new permissions_json value, preserving all unrelated markers. */
export function withRiderState(
  permissionsJson: unknown,
  patch: Partial<DeliveryRiderState>
): string {
  const parts = parsePermissionArray(permissionsJson).filter(
    (item) => !item.startsWith(APPROVAL_PREFIX) && !item.startsWith(AVAILABILITY_PREFIX)
  );
  const current = readRiderState(permissionsJson);
  const approval = patch.deliveryApproval || current.deliveryApproval;
  const availability = patch.availability || current.availability;
  parts.push(`${APPROVAL_PREFIX}${approval}`, `${AVAILABILITY_PREFIX}${availability}`);
  return JSON.stringify(parts);
}

export function hasDurableOwnerApproval(row: {
  permissions_json?: unknown;
  status?: unknown;
}): boolean {
  const state = readRiderState(row.permissions_json);
  if (String(row.status || '') !== 'active') return false;
  return state.deliveryApproval === 'owner_approved' || state.deliveryApproval === 'owner_added';
}

export function isApprovedDeliveryPartner(row: {
  permissions_json?: unknown;
  status?: unknown;
  role?: unknown;
}): boolean {
  if (String(row.role || 'delivery_partner') !== 'delivery_partner') return false;
  return hasDurableOwnerApproval(row);
}

export function isAutoAssignmentEligible(row: {
  permissions_json?: unknown;
  status?: unknown;
  role?: unknown;
}): boolean {
  if (!isApprovedDeliveryPartner(row)) return false;
  return readRiderState(row.permissions_json).availability === 'online';
}

/**
 * Legacy active rows without a durable approval marker are never treated as
 * approved. They are reported to the owner UI but stay ineligible until an
 * owner records approval; this helper never changes or suspends them.
 */
export function isDeliveryPartnerApprovalUnverifiable(row: {
  permissions_json?: unknown;
  invited_by?: unknown;
  user_id?: unknown;
}): boolean {
  const state = readRiderState(row.permissions_json);
  if (state.deliveryApproval === 'owner_approved' || state.deliveryApproval === 'owner_added') {
    return false;
  }
  return true;
}

export function riderStateForUi(row: { permissions_json?: unknown }): DeliveryRiderState {
  return readRiderState(row.permissions_json);
}
