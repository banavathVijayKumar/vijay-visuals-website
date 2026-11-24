// ============================================================================
// POST /api/proposals/:id/checkout — Cashfree Payment Handoff for Approved Proposal
// Security Enforcements:
// 1. Mandatory Secure Token Validation (Reject missing, invalid, or mismatched tokens)
// 2. Server-Side Proposal Expiry Guard (HTTP 410)
// 3. Strict Precondition State Validation (Requires proposal.status === 'accepted_locked')
// 4. Authoritative Pricing (Amounts derived strictly from verified D1 records)
// 5. Rejection of Draft, Sent, Viewed, Declined, and Already-Paid proposals
// ============================================================================

import {
  createEdgeCashfreeOrder,
  getEdgeCashfreeStatus,
  getSafeCashfreeNotifyUrl,
  resolveSafeReturnUrl,
} from '../../payments/_cashfree';
import { PagesContext, errorJson, handleOptions, json, parseJsonBody } from '../../_shared';

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

  const body = await parseJsonBody<{ token?: string }>(request);

  // 1. Mandatory Secure Token Validation
  const suppliedToken = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!suppliedToken || suppliedToken.length < 8) {
    return errorJson('Invalid or missing proposal security token.', 403);
  }

  // Fetch proposal from D1
  const proposal = await env.DB.prepare(
    'SELECT * FROM platform_proposals WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first<Record<string, any>>();

  // Safe authorization error preventing ID enumeration
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

  // 3. Precondition State Validation
  if (proposal.status === 'paid' || proposal.delivery_status === 'paid') {
    return errorJson('This proposal has already been paid.', 409);
  }

  if (proposal.status === 'declined' || proposal.delivery_status === 'rejected') {
    return errorJson('Declined proposals cannot be checked out.', 409);
  }

  if (proposal.status !== 'accepted_locked') {
    return errorJson('Proposal must be approved by the customer before payment can be initiated.', 400);
  }

  // 4. Verify Cashfree Server Configuration
  const cfStatus = getEdgeCashfreeStatus(env);
  if (!cfStatus.configured) {
    return errorJson('Cashfree Payment Gateway is not configured in environment variables.', 503);
  }

  // 5. Authoritative Pricing Calculation (Never trusting client-supplied amounts)
  const baseAmountInr = Number(proposal.development_fee_inr) || 7999;
  const hasConfirmedGst = Boolean(Number(proposal.gst_percent) > 0 && Number(proposal.gst_inr) > 0);
  const gstAmountInr = hasConfirmedGst ? Number(proposal.gst_inr) : 0;
  const amountInr = Math.max(
    1,
    hasConfirmedGst
      ? (Number(proposal.grand_total_inr) || (baseAmountInr + gstAmountInr))
      : (Number(proposal.grand_total_inr) || baseAmountInr)
  );

  const cfOrderId = `vv_prop_${proposal.proposal_number.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Date.now().toString().slice(-4)}`;
  const returnUrl = resolveSafeReturnUrl(
    `/proposal/${proposal.secure_token}?order_id=${encodeURIComponent(cfOrderId)}&status=return`,
    `/proposal/${proposal.secure_token}`,
    request,
    env
  );
  const notifyUrl = getSafeCashfreeNotifyUrl(request, env);

  try {
    const cfOrder = await createEdgeCashfreeOrder(env, {
      orderId: cfOrderId,
      amountInr,
      currency: 'INR',
      customerDetails: {
        customerId: `prop_cust_${proposal.id}_${(proposal.customer_phone || '').replace(/[^0-9]/g, '') || 'client'}`,
        customerName: proposal.customer_name || 'Customer',
        customerEmail: proposal.customer_email || 'vk66278@gmail.com',
        customerPhone: proposal.customer_phone || '9381362201',
      },
      orderMeta: {
        returnUrl,
        notifyUrl,
      },
      request,
      orderNote: `[PROPOSAL] ${proposal.proposal_number} - ${proposal.business_name} (${proposal.package_tier || 'STARTER'})`,
      orderTags: {
        proposal_id: String(proposal.id),
        proposal_number: proposal.proposal_number,
        package_tier: proposal.package_tier || 'STARTER',
        is_sandbox_test: cfStatus.mode === 'sandbox' ? 'true' : 'false',
      },
    });

    if (!cfOrder.paymentSessionId) {
      throw new Error('Cashfree did not return a valid payment_session_id.');
    }

    // Insert or replace cashfree_payments tracking record
    await env.DB.prepare(
      `INSERT OR REPLACE INTO cashfree_payments (
        order_id, cf_order_id, payment_session_id, entity_type, reference_id,
        website_id, user_id, user_email, user_phone, base_amount_inr,
        gst_amount_inr, amount_inr, currency, environment, status,
        notes_json, raw_response_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'platform_package', ?,
        ?, ?, ?, ?, ?,
        ?, ?, 'INR', ?, 'CREATED',
        ?, ?, datetime('now'), datetime('now')
      )`
    )
      .bind(
        cfOrderId,
        String(cfOrder.order.cf_order_id || ''),
        cfOrder.paymentSessionId,
        proposal.package_code || 'business-website',
        proposal.website_id,
        proposal.owner_id || 'unassigned_client',
        proposal.customer_email,
        proposal.customer_phone,
        baseAmountInr,
        gstAmountInr,
        amountInr,
        cfStatus.mode,
        JSON.stringify({
          proposalId: proposal.id,
          proposalNumber: proposal.proposal_number,
          businessName: proposal.business_name,
          packageTier: proposal.package_tier,
        }),
        JSON.stringify(cfOrder.order)
      )
      .run();

    // Link cashfree_order_id in platform_proposals
    await env.DB.prepare(
      'UPDATE platform_proposals SET cashfree_order_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(cfOrderId, id)
      .run();

    return json({
      paymentSessionId: cfOrder.paymentSessionId,
      orderId: cfOrderId,
      cfOrderId: cfOrder.order.cf_order_id,
      environment: cfStatus.mode,
      amountInr,
      proposalNumber: proposal.proposal_number,
      businessName: proposal.business_name,
    });
  } catch (err) {
    console.error('Failed to create Cashfree proposal order:', err instanceof Error ? err.message : String(err));
    return errorJson(err instanceof Error ? err.message : 'Cashfree order creation failed.', 500);
  }
}
