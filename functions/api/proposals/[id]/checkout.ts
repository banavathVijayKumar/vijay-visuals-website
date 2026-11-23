// ============================================================================
// POST /api/proposals/:id/checkout — Cashfree Payment Handoff for Approved Proposal
// ============================================================================

import { createEdgeCashfreeOrder, getEdgeCashfreeStatus } from '../../payments/_cashfree';
import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = Number(params?.id);
  if (!id) return errorJson('Invalid proposal ID.', 400);

  const body = await parseJsonBody<{ token?: string }>(request);

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal) return errorJson('Proposal not found.', 404);

  // Security: token match if supplied
  if (body?.token && proposal.secure_token && body.token !== proposal.secure_token) {
    return errorJson('Invalid security token.', 403);
  }

  const cfStatus = getEdgeCashfreeStatus(env);
  if (!cfStatus.configured) {
    return errorJson('Cashfree Payment Gateway is not configured in environment variables.', 503);
  }

  const amountInr = Math.max(1, Number(proposal.grand_total_inr) || 9439);
  const baseAmountInr = Number(proposal.development_fee_inr) || 7999;
  const gstAmountInr = Number(proposal.gst_inr) || Math.round((baseAmountInr * 18) / 100);

  const cfOrderId = `vv_prop_${proposal.proposal_number.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Date.now().toString().slice(-4)}`;
  const returnUrl = `https://master.vijay-visuals-site.pages.dev/proposal/${proposal.secure_token}?order_id=${encodeURIComponent(cfOrderId)}&status=return`;

  try {
    const cfOrder = await createEdgeCashfreeOrder(env, {
      orderId: cfOrderId,
      orderAmount: amountInr,
      currency: 'INR',
      customerDetails: {
        customerId: `prop_cust_${proposal.id}_${proposal.customer_phone.replace(/[^0-9]/g, '') || 'client'}`,
        customerName: proposal.customer_name,
        customerEmail: proposal.customer_email || 'client@vijayvisuals.com',
        customerPhone: proposal.customer_phone || '9381362201',
      },
      orderMeta: {
        returnUrl,
        notifyUrl: 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree',
      },
      orderNote: `[PROPOSAL] ${proposal.proposal_number} - ${proposal.business_name} (${proposal.package_tier || 'STARTER'})`,
      orderTags: {
        proposal_id: String(proposal.id),
        proposal_number: proposal.proposal_number,
        package_tier: proposal.package_tier || 'STARTER',
        is_sandbox_test: cfStatus.mode === 'sandbox' ? 'true' : 'false',
      },
    });

    if (!cfOrder.payment_session_id) {
      throw new Error('Cashfree did not return a valid payment_session_id.');
    }

    // Insert cashfree_payments tracking record
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
        String(cfOrder.cf_order_id || ''),
        cfOrder.payment_session_id,
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
        JSON.stringify(cfOrder)
      )
      .run();

    // Link cashfree_order_id in platform_proposals
    await env.DB.prepare(
      'UPDATE platform_proposals SET cashfree_order_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(cfOrderId, id)
      .run();

    return json({
      paymentSessionId: cfOrder.payment_session_id,
      orderId: cfOrderId,
      cfOrderId: cfOrder.cf_order_id,
      environment: cfStatus.mode,
      amountInr,
      proposalNumber: proposal.proposal_number,
      businessName: proposal.business_name,
    });
  } catch (err) {
    console.error('Failed to create Cashfree proposal order:', err);
    return errorJson(err instanceof Error ? err.message : 'Cashfree order creation failed.', 500);
  }
}
