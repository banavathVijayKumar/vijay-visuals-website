// ============================================================================
// POST /api/proposals/:id/approve — Customer Proposal Approval & Rejection
// Security Enforcements:
// 1. Mandatory Secure Token Validation (Reject missing, invalid, or mismatched tokens)
// 2. Server-Side Expiration Guard (HTTP 410 on expired proposals)
// 3. Strict State Transition Checks (Only sent/viewed/ready/draft/shared can transition)
// 4. Atomic conditional SQL updates to prevent concurrent race condition bypasses
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = Number(params?.id);
  if (!id || !Number.isInteger(id) || id <= 0) {
    return errorJson('Invalid proposal ID.', 400);
  }

  const body = await parseJsonBody<{
    action: 'approve' | 'reject';
    token?: string;
    selectedTier?: 'STARTER' | 'GOLD' | 'PREMIUM';
    reason?: string;
  }>(request);

  if (!body || !body.action) {
    return errorJson('Action (approve or reject) is required.', 400);
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return errorJson('Invalid proposal action. Allowed actions are approve or reject.', 400);
  }

  // 1. Mandatory Secure Token Validation
  const suppliedToken = typeof body.token === 'string' ? body.token.trim() : '';
  if (!suppliedToken || suppliedToken.length < 8) {
    return errorJson('Invalid or missing proposal security token.', 403);
  }

  // Fetch proposal from D1
  const proposal = await env.DB.prepare(
    'SELECT * FROM platform_proposals WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first<Record<string, any>>();

  // Return a safe authorization error without exposing whether another customer's proposal ID exists
  if (!proposal || !proposal.secure_token || proposal.secure_token !== suppliedToken) {
    return errorJson('Proposal not found or access denied.', 403);
  }

  // 2. Server-Side Proposal Expiry Enforcement
  if (proposal.expires_at) {
    const expiryTime = new Date(proposal.expires_at).getTime();
    if (!isNaN(expiryTime) && expiryTime < Date.now()) {
      return errorJson('This proposal has expired. Please contact Vijay Visuals for an updated proposal.', 410);
    }
  }

  // 3. Approval and Decline State Validation
  if (proposal.status === 'paid' || proposal.delivery_status === 'paid') {
    return errorJson('This proposal has already been paid and cannot be modified.', 409);
  }

  if (proposal.status === 'accepted_locked' || proposal.delivery_status === 'approved') {
    return errorJson('This proposal has already been approved.', 409);
  }

  if (proposal.status === 'declined' || proposal.delivery_status === 'rejected') {
    return errorJson('This proposal has already been declined.', 409);
  }

  const ALLOWED_INITIAL_STATES = ['sent', 'viewed', 'ready', 'draft', 'shared'];
  if (!ALLOWED_INITIAL_STATES.includes(proposal.status)) {
    return errorJson(
      `Proposal cannot be ${body.action === 'approve' ? 'approved' : 'declined'} from its current status (${proposal.status}).`,
      409
    );
  }

  // 4. Atomic conditional transition: REJECT
  if (body.action === 'reject') {
    const reason = sanitizeText(body.reason || 'Customer declined proposal.', 300);
    const updateRes = await env.DB.prepare(
      `UPDATE platform_proposals
       SET status = 'declined',
           delivery_status = 'rejected',
           rejected_at = datetime('now'),
           rejection_reason = ?,
           updated_at = datetime('now')
       WHERE id = ? AND secure_token = ? AND status IN ('sent', 'viewed', 'ready', 'draft', 'shared')`
    )
      .bind(reason, id, suppliedToken)
      .run();

    if (updateRes?.meta?.changes === 0) {
      return errorJson('State transition conflict. Proposal may have already been approved or declined.', 409);
    }

    const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first();
    return json({
      success: true,
      action: 'rejected',
      proposal: updated,
      message: 'Proposal has been declined. Thank you for your feedback.',
    });
  }

  // 5. Atomic conditional transition: APPROVE
  const selectedTier = ['STARTER', 'GOLD', 'PREMIUM'].includes(body.selectedTier || '')
    ? body.selectedTier!
    : (proposal.package_tier || 'STARTER');

  // Derive payable amount authoritatively
  let payableAmountInr = Number(proposal.grand_total_inr) || Number(proposal.development_fee_inr) || 7999;
  if (selectedTier === 'STARTER') {
    payableAmountInr = Number(proposal.grand_total_inr) || Number(proposal.development_fee_inr) || 7999;
  } else if (selectedTier === 'GOLD') {
    try {
      const cmp = JSON.parse(proposal.packages_comparison_json || '{}');
      payableAmountInr = Number(cmp.gold?.priceInr) ? Math.round(cmp.gold.priceInr * 1.18) : 17699;
    } catch {
      payableAmountInr = 17699;
    }
  } else if (selectedTier === 'PREMIUM') {
    try {
      const cmp = JSON.parse(proposal.packages_comparison_json || '{}');
      payableAmountInr = Number(cmp.premium?.priceInr) ? Math.round(cmp.premium.priceInr * 1.18) : 29499;
    } catch {
      payableAmountInr = 29499;
    }
  }

  const updateRes = await env.DB.prepare(
    `UPDATE platform_proposals
     SET status = 'accepted_locked',
         delivery_status = 'approved',
         package_tier = ?,
         approved_at = datetime('now'),
         customer_confirmed_at = datetime('now'),
         grand_total_inr = ?,
         updated_at = datetime('now')
     WHERE id = ? AND secure_token = ? AND status IN ('sent', 'viewed', 'ready', 'draft', 'shared')`
  )
    .bind(selectedTier, payableAmountInr, id, suppliedToken)
    .run();

  if (updateRes?.meta?.changes === 0) {
    return errorJson('State transition conflict. Proposal may have already been approved or declined.', 409);
  }

  const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first();

  return json({
    success: true,
    action: 'approved',
    selectedTier,
    payableAmountInr,
    proposal: updated,
    message: `Proposal approved for the ${selectedTier} package! You may now proceed to secure payment via Cashfree.`,
  });
}
