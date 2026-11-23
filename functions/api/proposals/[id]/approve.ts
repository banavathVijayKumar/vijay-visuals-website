// ============================================================================
// POST /api/proposals/:id/approve — Customer Proposal Approval & Rejection
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = Number(params?.id);
  if (!id) return errorJson('Invalid proposal ID.', 400);

  const body = await parseJsonBody<{
    action: 'approve' | 'reject';
    token?: string;
    selectedTier?: 'STARTER' | 'GOLD' | 'PREMIUM';
    reason?: string;
  }>(request);

  if (!body || !body.action) return errorJson('Action (approve or reject) is required.', 400);

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal) return errorJson('Proposal not found.', 404);

  // Security: verify token matches proposal secure_token if unauthenticated
  if (body.token && proposal.secure_token && body.token !== proposal.secure_token) {
    return errorJson('Invalid proposal security token.', 403);
  }

  if (body.action === 'reject') {
    const reason = sanitizeText(body.reason || 'Customer declined proposal.', 300);
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET status = 'declined',
           delivery_status = 'rejected',
           rejected_at = datetime('now'),
           rejection_reason = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(reason, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first();
    return json({
      success: true,
      action: 'rejected',
      proposal: updated,
      message: 'Proposal has been declined. Thank you for your feedback.',
    });
  }

  // Handle Approve
  const selectedTier = ['STARTER', 'GOLD', 'PREMIUM'].includes(body.selectedTier || '')
    ? body.selectedTier!
    : (proposal.package_tier || 'STARTER');

  let payableAmountInr = proposal.grand_total_inr || 9439;
  if (selectedTier === 'STARTER') {
    payableAmountInr = proposal.grand_total_inr || 9439;
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

  await env.DB.prepare(
    `UPDATE platform_proposals
     SET status = 'accepted_locked',
         delivery_status = 'approved',
         package_tier = ?,
         approved_at = datetime('now'),
         customer_confirmed_at = datetime('now'),
         grand_total_inr = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(selectedTier, payableAmountInr, id)
    .run();

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
