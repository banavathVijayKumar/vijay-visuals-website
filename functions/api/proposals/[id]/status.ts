// ============================================================================
// PATCH /api/proposals/:id/status
// Express legacy quotation status behavior on D1 platform_proposals:
// accepted (owner or admin), converted/expired (super admin only), idempotent
// accepted, price-lock timestamps, and PROPOSAL_STATUS_UPDATED audit entry.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  json,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';

interface ProposalRow {
  id: number;
  proposal_number: string;
  owner_id: string | null;
  customer_email: string;
  customer_name: string;
  business_name: string;
  status: string;
  delivery_status?: string | null;
  customer_confirmed_at: string | null;
  approved_at?: string | null;
  development_fee_inr: number;
  maintenance_monthly_inr: number;
  domain_hosting_yearly_inr: number;
  grand_total_inr: number;
  gst_inr: number;
  created_at: string;
  [key: string]: any;
}

const REQUESTED_TO_D1_STATUS: Record<string, string> = {
  accepted: 'accepted_locked',
  converted: 'paid',
  expired: 'expired',
};

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function uiStatus(row: ProposalRow): string {
  if (row.status === 'accepted_locked' || row.delivery_status === 'approved') return 'accepted';
  if (row.status === 'paid' || row.delivery_status === 'paid') return 'converted';
  if (row.status === 'expired') return 'expired';
  return row.status;
}

function mapProposal(row: ProposalRow, requestedStatus?: string): Record<string, any> {
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(row.addons_json || '[]');
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  const status = requestedStatus || uiStatus(row);
  return {
    ...row,
    status,
    id: Number(row.id),
    proposalNumber: String(row.proposal_number || ''),
    customerName: String(row.customer_name || ''),
    customerEmail: String(row.customer_email || ''),
    businessName: String(row.business_name || ''),
    billingPeriod: Number(row.maintenance_monthly_inr || 0) > 0 ? 'monthly' : 'one_time',
    itemsJson: JSON.stringify(items),
    oneTimeSubtotalInr:
      Number(row.development_fee_inr || 0) + Number(row.domain_hosting_yearly_inr || 0),
    recurringSubtotalInr: Number(row.maintenance_monthly_inr || 0),
    gstInr: Number(row.gst_inr || 0),
    grandTotalInr: Number(row.grand_total_inr || 0),
    lockedAt: String(row.approved_at || row.customer_confirmed_at || ''),
    acceptedAt: String(row.customer_confirmed_at || ''),
    createdAt: String(row.created_at || ''),
  };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DB) return errorJson('Database binding is not configured.', 503);

    const body = await parseJsonBody<{ status?: string }>(request);
    if (!body) return errorJson('Invalid JSON payload.', 400);

    const requestedStatus = String(body.status || '').trim().toLowerCase();
    if (!REQUESTED_TO_D1_STATUS[requestedStatus]) {
      return errorJson('Invalid proposal status.', 400);
    }

    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return errorJson('Invalid proposal ID.', 400);

    const existing = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ProposalRow>();
    if (!existing) return errorJson('Proposal not found.', 404);

    const email = String(auth.user.email || '').trim().toLowerCase();
    const isOwner =
      Boolean(existing.owner_id) &&
      (existing.owner_id === auth.user.id || existing.owner_id === auth.user.authSubject);
    const isCustomerByEmail =
      Boolean(email) && String(existing.customer_email || '').trim().toLowerCase() === email;

    if (!auth.user.isSuperAdmin && !isOwner && !isCustomerByEmail) {
      return errorJson('Forbidden: you cannot update this proposal.', 403);
    }
    if (requestedStatus !== 'accepted' && !auth.user.isSuperAdmin) {
      return errorJson('Only Super Admin can mark proposals converted or expired.', 403);
    }

    // Module 11 rule: never silently alter an already accepted quotation's pricing.
    if (uiStatus(existing) === 'accepted' && requestedStatus === 'accepted') {
      return json({ proposal: mapProposal(existing) });
    }

    const nextStatus = REQUESTED_TO_D1_STATUS[requestedStatus];
    const setParts: string[] = ['status = ?', 'updated_at = datetime(\'now\')'];
    const binds: unknown[] = [nextStatus];
    // Express sets lockedAt = existing.lockedAt || new Date() for every transition.
    setParts.push('approved_at = COALESCE(approved_at, datetime(\'now\'))');

    if (requestedStatus === 'accepted') {
      setParts.push("delivery_status = 'approved'");
      setParts.push("customer_confirmed_at = datetime('now')");
    } else if (requestedStatus === 'converted') {
      setParts.push("delivery_status = 'paid'");
    } else {
      setParts.push("delivery_status = 'expired'");
      setParts.push('expires_at = COALESCE(expires_at, datetime(\'now\'))');
    }

    await env.DB.prepare(
      `UPDATE platform_proposals SET ${setParts.join(', ')} WHERE id = ?`
    )
      .bind(...binds, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ? LIMIT 1')
      .bind(id)
      .first<ProposalRow>();

    if (updated) {
      await writeAuditLog(env, {
        actorId: auth.user.id,
        actorRole: auth.user.isSuperAdmin ? 'super_admin' : 'business_owner',
        action: 'PROPOSAL_STATUS_UPDATED',
        targetType: 'proposal',
        targetId: String(updated.id),
        details: {
          actorEmail: auth.user.email,
          proposalNumber: sanitizeText(updated.proposal_number, 80),
          status: requestedStatus,
          lockedTotalInr: Number(updated.grand_total_inr || 0),
        },
      });
    }

    return json({
      proposal: updated ? mapProposal(updated, requestedStatus) : null,
      status: requestedStatus,
    });
  } catch (err) {
    console.error('PATCH /api/proposals/:id/status failed:', err);
    return errorJson('Failed to update proposal status.', 500);
  }
}
