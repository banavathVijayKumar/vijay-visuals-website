// ============================================================================
// GET & POST /api/proposals — Locked Quotations & Proposals (Cloudflare Pages)
// ============================================================================

import {
  PagesContext,
  handleOptions,
  json,
  errorJson,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../_shared';
import { requireUser } from '../_auth';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const body = await parseJsonBody<{
    planCodes?: string[];
    billingPeriod?: 'monthly' | 'yearly';
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    businessName?: string;
  }>(request);

  if (!body) return errorJson('Invalid request payload.', 400);

  const customerName = sanitizeText(body.customerName, 100);
  const customerEmail = sanitizeText(body.customerEmail, 150).toLowerCase();
  const customerPhone = sanitizeText(body.customerPhone, 30);
  const businessName = sanitizeText(body.businessName, 150);

  if (!customerName || !customerEmail || !customerPhone || !businessName) {
    return errorJson('Customer name, email, phone, and business name are required.', 400);
  }

  const planCodes = Array.isArray(body.planCodes) ? body.planCodes : ['business-website'];
  const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

  // Calculate pricing
  let subtotal = 0;
  const items = planCodes.map((code) => {
    let price = 7999;
    let name = 'Business Website Package';
    if (code === 'starter-website') { price = 2999; name = 'Starter Website Package'; }
    else if (code === 'ecommerce-website') { price = 14999; name = 'E-Commerce Website Package'; }
    else if (code === 'website-plus-pwa') { price = 22999; name = 'Website + Optional Branded PWA Add-On'; }
    subtotal += price;
    return { code, name, price };
  });

  const gstInr = Math.round(subtotal * 0.18);
  const grandTotalInr = subtotal + gstInr;
  const proposalNumber = `VV-PROP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomHex(4).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO platform_proposals 
         (proposal_number, customer_name, customer_email, customer_phone, business_name, items_json, subtotal_inr, gst_inr, grand_total_inr, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
      )
        .bind(
          proposalNumber,
          customerName,
          customerEmail,
          customerPhone,
          businessName,
          JSON.stringify(items),
          subtotal,
          gstInr,
          grandTotalInr,
          nowIso
        )
        .run();
    } catch {
      // If table is missing or write fails, continue with generated response
    }
  }

  return json({
    success: true,
    proposal: {
      proposalNumber,
      customerName,
      customerEmail,
      customerPhone,
      businessName,
      items,
      subtotalInr: subtotal,
      gstInr,
      grandTotalInr,
      status: 'locked',
      createdAt: nowIso,
    },
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return json({ proposals: [] });
  }

  try {
    const isSuperAdmin = auth.user.isSuperAdmin;
    const rows = isSuperAdmin
      ? await env.DB.prepare('SELECT * FROM platform_proposals ORDER BY created_at DESC LIMIT 50').all()
      : await env.DB.prepare('SELECT * FROM platform_proposals WHERE customer_email = ? ORDER BY created_at DESC LIMIT 50')
          .bind(auth.user.email.toLowerCase())
          .all();

    return json({ proposals: rows.results || [] });
  } catch {
    return json({ proposals: [] });
  }
}
