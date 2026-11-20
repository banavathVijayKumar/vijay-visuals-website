// ============================================================================
// GET & POST /api/platform/crm-finance
// CRM Leads & Loyalty, Appointments, Finance Ledger (Clearly Labeled Estimates),
// and Consent-Only Marketing Campaigns (Honest Setup Required when unconfigured)
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  getNotificationChannelStatus,
  json,
  parseJsonBody,
  sanitizeText,
} from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  if (!websiteId) return errorJson('websiteId query parameter is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const [leads, appointments, ledger, campaigns] = await Promise.all([
    env.DB.prepare('SELECT * FROM crm_contacts_leads WHERE website_id = ? ORDER BY updated_at DESC LIMIT 200')
      .bind(websiteId)
      .all(),
    env.DB.prepare('SELECT * FROM appointments WHERE website_id = ? ORDER BY scheduled_start DESC LIMIT 100')
      .bind(websiteId)
      .all(),
    env.DB.prepare('SELECT * FROM finance_ledger WHERE website_id = ? ORDER BY entry_date DESC, id DESC LIMIT 200')
      .bind(websiteId)
      .all<{ entry_type: string; amount_inr: number; gst_inr: number }>(),
    env.DB.prepare('SELECT * FROM marketing_campaigns WHERE website_id = ? ORDER BY created_at DESC LIMIT 50')
      .bind(websiteId)
      .all(),
  ]);

  const rows = ledger.results || [];
  let totalSalesInr = 0;
  let totalExpensesInr = 0;
  let totalPurchasesInr = 0;
  let totalRefundsInr = 0;
  let estimatedGstCollectedInr = 0;

  for (const r of rows) {
    const amt = Number(r.amount_inr || 0);
    const gst = Number(r.gst_inr || 0);
    if (r.entry_type === 'sale') {
      totalSalesInr += amt;
      estimatedGstCollectedInr += gst;
    } else if (r.entry_type === 'expense') {
      totalExpensesInr += amt;
    } else if (r.entry_type === 'purchase') {
      totalPurchasesInr += amt;
    } else if (r.entry_type === 'refund') {
      totalRefundsInr += amt;
    }
  }

  const estimatedNetProfitInr = totalSalesInr - totalRefundsInr - totalPurchasesInr - totalExpensesInr;

  return json({
    leads: leads.results || [],
    appointments: appointments.results || [],
    ledger: rows,
    financeSummary: {
      isEstimateOnly: true,
      disclaimer:
        'All Profit & Loss and GST totals are operational estimates based on recorded entries. Verify with a Chartered Accountant before statutory tax filing.',
      totalSalesInr,
      totalRefundsInr,
      totalPurchasesInr,
      totalExpensesInr,
      estimatedNetProfitInr,
      estimatedGstCollectedInr,
    },
    campaigns: campaigns.results || [],
    channelStatus: getNotificationChannelStatus(env),
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.websiteId || !body.action) {
    return errorJson('websiteId and action are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const action = String(body.action);

  if (action === 'add_lead') {
    const fullName = sanitizeText(body.fullName || '', 120);
    if (fullName.length < 2) return errorJson('Lead fullName is required.', 400);
    const res = await env.DB.prepare(
      `INSERT INTO crm_contacts_leads
        (website_id, owner_id, full_name, phone, email, source, stage, loyalty_points,
         marketing_consent, notes, follow_up_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        fullName,
        sanitizeText(body.phone || '', 30),
        sanitizeText(body.email || '', 120),
        sanitizeText(body.source || 'manual', 40),
        ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].includes(String(body.stage || ''))
          ? String(body.stage)
          : 'new',
        Math.max(0, Math.round(Number(body.loyaltyPoints || 0))),
        body.marketingConsent ? 1 : 0,
        sanitizeText(body.notes || '', 500),
        body.followUpAt ? sanitizeText(body.followUpAt, 32) : null
      )
      .run();

    return json({ leadId: Number(res.meta?.last_row_id || 0), fullName }, 201);
  }

  if (action === 'unsubscribe_lead') {
    const leadId = Number(body.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return errorJson('Valid leadId is required.', 400);
    await env.DB.prepare(
      `UPDATE crm_contacts_leads SET marketing_consent = 0, unsubscribed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(leadId, websiteId)
      .run();
    return json({ leadId, unsubscribed: true });
  }

  if (action === 'add_appointment') {
    const customerName = sanitizeText(body.customerName || '', 120);
    const serviceName = sanitizeText(body.serviceName || '', 120);
    const scheduledStart = sanitizeText(body.scheduledStart || '', 40);
    if (!customerName || !serviceName || !scheduledStart) {
      return errorJson('customerName, serviceName, and scheduledStart are required.', 400);
    }
    const res = await env.DB.prepare(
      `INSERT INTO appointments
        (website_id, owner_id, customer_name, customer_phone, customer_email, service_name,
         scheduled_start, duration_minutes, assigned_staff_name, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        customerName,
        sanitizeText(body.customerPhone || '', 30),
        sanitizeText(body.customerEmail || '', 120),
        serviceName,
        scheduledStart,
        Math.max(10, Math.min(480, Math.round(Number(body.durationMinutes || 30)))),
        sanitizeText(body.assignedStaffName || '', 100),
        sanitizeText(body.notes || '', 400)
      )
      .run();
    return json({ appointmentId: Number(res.meta?.last_row_id || 0) }, 201);
  }

  if (action === 'add_ledger_entry') {
    if (access.effectiveRole === 'business_staff') {
      return errorJson('Only Business Owners or Managers can record finance ledger entries.', 403);
    }
    const entryType = String(body.entryType || 'expense');
    if (!['sale', 'expense', 'purchase', 'refund', 'tax_adjustment'].includes(entryType)) {
      return errorJson('Invalid finance entryType.', 400);
    }
    const amountInr = Math.round(Number(body.amountInr || 0));
    const gstInr = Math.max(0, Math.round(Number(body.gstInr || 0)));
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return errorJson('amountInr must be a positive integer.', 400);
    }
    const res = await env.DB.prepare(
      `INSERT INTO finance_ledger
        (website_id, owner_id, entry_type, category, amount_inr, gst_inr, reference_id, notes, entry_date, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        entryType,
        sanitizeText(body.category || 'general', 60),
        amountInr,
        gstInr,
        sanitizeText(body.referenceId || '', 80),
        sanitizeText(body.notes || '', 400),
        sanitizeText(body.entryDate || new Date().toISOString().slice(0, 10), 20),
        auth.user.id
      )
      .run();
    return json({ ledgerEntryId: Number(res.meta?.last_row_id || 0), entryType, amountInr }, 201);
  }

  if (action === 'create_campaign') {
    const name = sanitizeText(body.name || '', 120);
    const channel = ['in_app', 'email', 'whatsapp', 'sms'].includes(String(body.channel || ''))
      ? (String(body.channel) as 'in_app' | 'email' | 'whatsapp' | 'sms')
      : 'in_app';
    const messageBody = sanitizeText(body.messageBody || '', 1000);
    if (!name || !messageBody) return errorJson('Campaign name and messageBody are required.', 400);

    // Strictly target consented contacts who have NOT unsubscribed
    const eligibleRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM crm_contacts_leads
       WHERE website_id = ? AND marketing_consent = 1 AND unsubscribed_at IS NULL`
    )
      .bind(websiteId)
      .first<{ cnt: number }>();
    const eligibleCount = Number(eligibleRow?.cnt || 0);

    const channels = getNotificationChannelStatus(env);
    let status: 'queued' | 'setup_required' = 'queued';
    let detail = `Queued for ${eligibleCount} consented recipient(s).`;

    if (channel === 'email' && channels.email !== 'configured') {
      status = 'setup_required';
      detail = 'Integration Required: Configure SMTP_HOST, SMTP_USER, and SMTP_PASS before sending email campaigns.';
    } else if (channel === 'whatsapp' && channels.whatsapp !== 'configured') {
      status = 'setup_required';
      detail = 'Integration Required: Configure WHATSAPP_CLOUD_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID before sending WhatsApp campaigns.';
    } else if (channel === 'sms' && channels.sms !== 'configured') {
      status = 'setup_required';
      detail = 'Integration Required: Configure SMS_PROVIDER_API_KEY before sending SMS campaigns.';
    }

    const res = await env.DB.prepare(
      `INSERT INTO marketing_campaigns
        (website_id, owner_id, name, channel, message_body, audience_filter, eligible_recipient_count, status, status_detail, created_at)
       VALUES (?, ?, ?, ?, ?, 'consented_only', ?, ?, ?, datetime('now'))`
    )
      .bind(websiteId, access.website.owner_id, name, channel, messageBody, eligibleCount, status, detail)
      .run();

    return json(
      {
        campaignId: Number(res.meta?.last_row_id || 0),
        channel,
        eligibleRecipientCount: eligibleCount,
        status,
        statusDetail: detail,
      },
      201
    );
  }

  return errorJson('Unsupported crm-finance action.', 400);
}
